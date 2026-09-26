import { stripeConfigured, stripeCall } from './_lib/stripe.js';
import { resolvePackage } from './_lib/packages.js';
import { findCoupon, precoComCupom } from './_lib/coupons.js';
import { createOrder, bindOrder } from './_lib/stripe-orders.js';
import { gameConfigured, one } from './_lib/gamedb.js';
import { accountFromRequest } from './_lib/session.js';
import { limitAuth } from './_lib/email-auth.js';
import { APP, checkoutInput, validateLiveSession, checkoutUrl } from './_lib/stripe-live-validation.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (process.env.STRIPE_MODE !== 'live' || !stripeConfigured() || !gameConfigured())
    return res.status(503).json({error:'Pagamento temporariamente indisponível.'});
  try {
    const account = await accountFromRequest(req);
    if (!Number.isSafeInteger(account) || account <= 0) return res.status(401).json({error:'Entre novamente na sua conta.'});
    await limitAuth('stripe-checkout', String(account), 6, 60000);
    let body, pkg, coupon, amount;
    try {
      body = checkoutInput(req.body);
      pkg = resolvePackage(body.packageId, body.amount);
      coupon = findCoupon(body.coupon);
      if (body.coupon && !coupon) throw new Error('coupon-invalid');
      amount = Math.round(precoComCupom(pkg, coupon) * 100);
      if (!Number.isSafeInteger(amount) || amount < 100 || amount > 2000000) throw new Error('amount-invalid');
    } catch {return res.status(400).json({error:'Confira o pacote, o valor e o cupom.'});}
    const user = await one('SELECT id,email FROM accounts WHERE id=? LIMIT 1', [account]);
    if (!user) return res.status(401).json({error:'Entre novamente na sua conta.'});
    const order = await createOrder(account, body.requestId, pkg.id, amount, pkg.coins);
    if (!order || order.fulfilled_at) return res.status(409).json({error:'Este pedido já foi concluído. Atualize a página.'});
    let session;
    if (order.session_id) session = await stripeCall('/checkout/sessions/' + encodeURIComponent(order.session_id), undefined, {method:'GET'});
    else session = await stripeCall('/checkout/sessions', {
      mode:'payment', 'payment_method_types[0]':'card',
      'payment_method_options[card][request_three_d_secure]':'any',
      'line_items[0][quantity]':'1', 'line_items[0][price_data][currency]':'brl',
      'line_items[0][price_data][unit_amount]':String(amount),
      'line_items[0][price_data][product_data][name]':`PWU — ${pkg.coins} Diamond Points`,
      'line_items[0][price_data][product_data][description]':'Saldo compartilhado entre os personagens desta conta.',
      client_reference_id:order.reference,
      'metadata[integration]':APP, 'metadata[reference]':order.reference,
      'metadata[account_id]':String(account), 'metadata[package_id]':pkg.id,
      'payment_intent_data[metadata][integration]':APP,
      'payment_intent_data[metadata][reference]':order.reference,
      customer_email:user.email || undefined,
      success_url:'https://pokeworlduniverse.com/minha-conta.html?pagamento=retorno',
      cancel_url:'https://pokeworlduniverse.com/minha-conta.html?pagamento=cancelado'
    }, {idempotencyKey:order.reference});
    validateLiveSession(session, order);
    if (session.status !== 'open') return res.status(409).json({error:'Este pedido foi concluído ou expirou. Atualize a página.'});
    const url = checkoutUrl(session.url);
    await bindOrder(account, order.reference, session.id);
    return res.status(200).json({checkoutUrl:url});
  } catch (err) {
    if (err.authPublic) return res.status(err.status).json({error:err.message});
    if (err.sqlMessage === 'stripe-account-review') return res.status(409).json({error:'Há um pagamento em análise nesta conta. Entre em contato com o suporte antes de uma nova compra.'});
    console.error('[stripe-checkout] failed', err.code || 'internal');
    return res.status(503).json({error:'Não foi possível abrir a Stripe agora. Tente novamente.'});
  }
}
