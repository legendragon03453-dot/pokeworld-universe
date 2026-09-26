import {pixConfigured,createPixOrder,fetchPixOrder} from './_lib/pix-mercadopago.js';
import {checkoutInput,validatePixOrder,pixTicketUrl} from './_lib/pix-validation.js';
import {createOrder,bindOrder} from './_lib/pix-orders.js';
import {resolvePackage} from './_lib/packages.js';
import {findCoupon,precoComCupom} from './_lib/coupons.js';
import {gameConfigured,one} from './_lib/gamedb.js';
import {accountFromRequest} from './_lib/session.js';
import {limitAuth} from './_lib/email-auth.js';

export default async function handler(req,res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!pixConfigured() || !gameConfigured()) return res.status(503).json({error:'Pix temporariamente indisponível.'});
  try {
    const account=await accountFromRequest(req);
    if (!Number.isSafeInteger(account) || account<1) return res.status(401).json({error:'Entre novamente na sua conta.'});
    await limitAuth('pix-checkout',String(account),6,60000);
    let body,pkg,amount;
    try {
      body=checkoutInput(req.body); pkg=resolvePackage(body.packageId,body.amount);
      const coupon=findCoupon(body.coupon);
      if (body.coupon && !coupon) throw new Error('invalid-coupon');
      amount=Math.round(precoComCupom(pkg,coupon)*100);
      if (!Number.isSafeInteger(amount) || amount<100 || amount>2000000) throw new Error('invalid-amount');
    } catch (err) {return res.status(400).json({error:err.message==='invalid-cpf' ? 'Informe um CPF válido para gerar o Pix.' : 'Confira o pacote, o valor e o cupom.'});}
    const user=await one('SELECT id,email FROM accounts WHERE id=? LIMIT 1',[account]);
    if (!user || typeof user.email !== 'string' || user.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email))
      return res.status(409).json({error:'Confira o e-mail da sua conta antes de pagar.'});
    const local=await createOrder(account,body.requestId,pkg.id,amount,pkg.coins);
    if (!local || local.fulfilled_at) return res.status(409).json({error:'Este pedido já foi concluído. Atualize a página.'});
    const remote=local.provider_order_id ? await fetchPixOrder(local.provider_order_id) : await createPixOrder(local,user.email,body.cpf);
    validatePixOrder(remote,local,{userId:process.env.MP_USER_ID,applicationId:process.env.MP_APPLICATION_ID});
    await bindOrder(account,local.reference,remote.id);
    if (remote.status!=='action_required' || remote.status_detail!=='waiting_transfer')
      return res.status(409).json({error:'Este pedido já foi processado ou expirou. Confira o saldo e o histórico antes de tentar novamente.'});
    return res.status(200).json({checkoutUrl:pixTicketUrl(remote.transactions.payments[0].payment_method.ticket_url)});
  } catch (err) {
    if (err.authPublic) return res.status(err.status).json({error:err.message});
    if (err.sqlMessage==='pix-account-review') return res.status(409).json({error:'Há um Pix em análise nesta conta. Entre em contato com o suporte.'});
    console.error('[pix-checkout] pending',err.code || 'internal');
    return res.status(503).json({error:'Não foi possível abrir o Pix agora. Tente novamente usando este mesmo pedido.'});
  }
}
