import { assinaturaStripeValida, rawBody, stripeCall } from '../_lib/stripe.js';
import { APP, UUID, validateLiveSession, validateLiveCharge } from '../_lib/stripe-live-validation.js';
import { readOrder, fulfillOrder, flagPayment } from '../_lib/stripe-orders.js';
export const config = {api:{bodyParser:false}};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  let raw;
  try { raw = await rawBody(req); } catch (err) { return res.status(err.code === 'body-too-large' ? 413 : 400).end(); }
  if (!assinaturaStripeValida({header:req.headers['stripe-signature'],rawBody:raw,secret:process.env.STRIPE_WEBHOOK_SECRET})) return res.status(401).end();
  let event;
  try {event=JSON.parse(raw);} catch {return res.status(400).end();}
  if (!event || typeof event !== 'object' || Array.isArray(event) || process.env.STRIPE_MODE !== 'live' || event.livemode !== true || !/^evt_[A-Za-z0-9]+$/.test(event.id || '')) return res.status(400).end();
  if (['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type)) {
    const object=event.data?.object;
    if (object?.livemode !== true || !/^pi_[A-Za-z0-9]+$/.test(object?.payment_intent || '')) return res.status(400).end();
    try {
      await flagPayment(event.id,object.payment_intent,event.type);
      console.error('[stripe] manual-review',JSON.stringify({event:event.id,type:event.type,intent:object.payment_intent}));
      return res.status(200).end();
    } catch {return res.status(500).end();}
  }
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) return res.status(200).end();
  const reported = event.data?.object;
  if (reported?.metadata?.integration !== APP) return res.status(200).end();
  if (!/^cs_live_[A-Za-z0-9]+$/.test(reported?.id || '') || !UUID.test(reported?.client_reference_id || '') || reported.livemode !== true) return res.status(400).end();
  try {
    const order = await readOrder(reported.client_reference_id);
    if (!order) throw new Error('order-missing');
    // Verify against Stripe's current state. Browser redirects never grant credit.
    const session = await stripeCall('/checkout/sessions/' + encodeURIComponent(reported.id), undefined, {method:'GET'});
    if (session.payment_status !== 'paid') return res.status(200).end();
    if (session.id !== reported.id) throw new Error('session-mismatch');
    validateLiveSession(session, order, {paid:true});
    const intent = await stripeCall('/payment_intents/' + encodeURIComponent(session.payment_intent) + '?expand%5B0%5D=latest_charge.refunds', undefined, {method:'GET'});
    const review = validateLiveCharge(intent, session, order);
    if (review) {
      // The live charge, not the arrival order of webhook events, triggers this hold.
      await flagPayment(event.id, intent.id, review);
      console.error('[stripe] manual-review', JSON.stringify({event:event.id,intent:intent.id,type:review}));
      return res.status(200).end();
    }
    const result = await fulfillOrder(order, session, event.id);
    if (!result || ![0,1].includes(Number(result.credited))) throw new Error('receipt-missing');
    console.log('[stripe] fulfillment', JSON.stringify({reference:order.reference,event:event.id,credited:Number(result.credited)===1}));
    return res.status(200).end();
  } catch (err) {
    console.error('[stripe] fulfillment-pending', JSON.stringify({event:event.id,code:err.code || err.message || 'internal'}));
    return res.status(500).end();
  }
}
