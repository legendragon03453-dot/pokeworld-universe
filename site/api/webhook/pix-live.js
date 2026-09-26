import {assinaturaValida} from '../_lib/pix-signature.js';
import {pixConfigured,fetchPixOrder} from '../_lib/pix-mercadopago.js';
import {ORDER_ID,UUID,validatePixOrder} from '../_lib/pix-validation.js';
import {readOrder,bindOrder,fulfillOrder,flagPayment} from '../_lib/pix-orders.js';

export default async function handler(req,res) {
  if (req.method!=='POST') return res.status(405).end();
  if (!pixConfigured() || !process.env.MP_WEBHOOK_SECRET) return res.status(503).end();
  const id=req.query?.['data.id'], event=req.body, requestId=req.headers['x-request-id'];
  if (!ORDER_ID.test(id || '') || typeof requestId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(requestId) ||
      !assinaturaValida({xSignature:req.headers['x-signature'],xRequestId:requestId,dataId:id,secret:process.env.MP_WEBHOOK_SECRET}))
    return res.status(401).end();
  if (event?.type!=='order' || event.live_mode!==true || event.data?.id!==id ||
      String(event.user_id)!==process.env.MP_USER_ID || String(event.application_id)!==process.env.MP_APPLICATION_ID)
    return res.status(400).end();
  try {
    const remote=await fetchPixOrder(id);
    if (remote.id!==id || !UUID.test(remote.external_reference || '')) throw new Error('pix-reference-invalid');
    const local=await readOrder(remote.external_reference);
    if (!local) throw new Error('pix-order-missing');
    validatePixOrder(remote,local,{userId:process.env.MP_USER_ID,applicationId:process.env.MP_APPLICATION_ID});
    await bindOrder(Number(local.account_id),local.reference,id);
    const payment=remote.transactions.payments[0];
    const review=[remote.status,remote.status_detail,payment.status,payment.status_detail].some(v=>/refund|chargeback|charged_back|dispute/.test(v || ''));
    if (review) {
      await flagPayment(requestId,payment.id,'payment_review');
      console.error('[pix] manual-review',JSON.stringify({reference:local.reference,order:id}));
      return res.status(200).end();
    }
    if (remote.status!=='processed' || remote.status_detail!=='accredited') return res.status(200).end();
    validatePixOrder(remote,local,{userId:process.env.MP_USER_ID,applicationId:process.env.MP_APPLICATION_ID,paid:true});
    const result=await fulfillOrder(local,remote,requestId);
    if (!result || ![0,1].includes(Number(result.credited))) throw new Error('pix-receipt-missing');
    console.log('[pix] fulfillment',JSON.stringify({reference:local.reference,order:id,credited:Number(result.credited)===1}));
    return res.status(200).end();
  } catch (err) {
    console.error('[pix] fulfillment-pending',JSON.stringify({order:id,code:err.code || err.message || 'internal'}));
    return res.status(500).end();
  }
}
