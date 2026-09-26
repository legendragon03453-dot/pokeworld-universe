export const APP = 'pwu-live-v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function checkoutInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).some(key => !['packageId','amount','coupon','requestId'].includes(key)) ||
      typeof body.packageId !== 'string' || body.packageId.length > 32 || typeof body.requestId !== 'string' || !UUID.test(body.requestId) ||
      (body.coupon !== undefined && (typeof body.coupon !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(body.coupon))) ||
      (body.packageId !== 'custom' && body.amount !== undefined)) throw new Error('invalid-input');
  if (body.packageId === 'custom') {
    if (!['number','string'].includes(typeof body.amount) || !/^\d{1,5}(\.\d{1,2})?$/.test(String(body.amount)) ||
      Number(body.amount) < 10 || Number(body.amount) > 20000) throw new Error('invalid-amount');
  }
  return body;
}
export function validateLiveSession(s, order, { paid = false } = {}) {
  if (!s || !order || s.livemode !== true || !/^cs_live_[A-Za-z0-9]+$/.test(s.id || '') ||
      s.mode !== 'payment' || s.client_reference_id !== order.reference ||
      s.metadata?.integration !== APP || s.metadata?.account_id !== String(order.account_id) ||
      s.metadata?.package_id !== order.package_id || s.metadata?.reference !== order.reference ||
      s.currency !== 'brl' || !Number.isSafeInteger(s.amount_total) || s.amount_total !== Number(order.amount_cents) ||
      s.amount_subtotal !== s.amount_total || s.payment_method_types?.length !== 1 || s.payment_method_types[0] !== 'card' ||
      (order.session_id && s.id !== order.session_id) ||
      (paid && (s.status !== 'complete' || s.payment_status !== 'paid' || !/^pi_[A-Za-z0-9]+$/.test(s.payment_intent || '')))) {
    throw new Error('stripe-payment-mismatch');
  }
  return s;
}
export function checkoutUrl(value) {
  let u; try {u = new URL(value);} catch {throw new Error('stripe-url-invalid');}
  if (u.protocol !== 'https:' || u.hostname !== 'checkout.stripe.com' || u.username || u.password || u.port)
    throw new Error('stripe-url-invalid');
  return value;
}

// A Checkout Session can stay paid after a refund. Check the current underlying
// charge before the atomic database fulfillment, including delayed notifications.
export function validateLiveCharge(intent, session, order) {
  const charge = intent?.latest_charge;
  const amount = Number(order.amount_cents);
  if (!intent || intent.object !== 'payment_intent' || intent.id !== session.payment_intent ||
      intent.livemode !== true || intent.status !== 'succeeded' || intent.currency !== 'brl' ||
      intent.amount !== amount || intent.amount_received !== amount ||
      intent.metadata?.integration !== APP || intent.metadata?.reference !== order.reference ||
      !charge || typeof charge !== 'object' || charge.object !== 'charge' ||
      !/^ch_[A-Za-z0-9]+$/.test(charge.id || '') || charge.payment_intent !== intent.id ||
      charge.livemode !== true || charge.status !== 'succeeded' || charge.paid !== true ||
      charge.captured !== true || charge.currency !== 'brl' || charge.amount !== amount ||
      charge.amount_captured !== amount || charge.payment_method_details?.type !== 'card' ||
      !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 ||
      typeof charge.refunded !== 'boolean' || typeof charge.disputed !== 'boolean' ||
      !Array.isArray(charge.refunds?.data) || typeof charge.refunds.has_more !== 'boolean')
    throw new Error('stripe-charge-mismatch');
  if (charge.disputed) return 'charge.dispute.created';
  if (charge.refunded || charge.amount_refunded > 0 || charge.refunds.has_more ||
      charge.refunds.data.some(refund => !['failed','canceled'].includes(refund?.status)))
    return 'charge.refunded';
  return null;
}
