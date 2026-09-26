/**
 * Webhook da Stripe. POST /api/webhook/stripe
 *
 * Precisa do corpo CRU para validar a assinatura, por isso o bodyParser
 * fica desligado. Eventos de conclusão/sucesso assíncrono só creditam quando
 * payment_status é paid. A entrega usa lock e transação no banco.
 */
import { assinaturaStripeValida, rawBody } from '../_lib/stripe.js';
import { validatePayment } from '../_lib/payment-validation.js';
import { findOrderByMpId, markPaidAndCredit } from '../_lib/orders.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const cru = await rawBody(req);

  if (!assinaturaStripeValida({ header: req.headers['stripe-signature'], rawBody: cru, secret })) {
    console.warn('[stripe] assinatura inválida');
    return res.status(401).end();
  }

  let evento;
  try { evento = JSON.parse(cru); } catch (e) { return res.status(400).end(); }

  // Never deliver on a redirect; only signed successful payment events.
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evento.type)) return res.status(200).end();

  try {
    const s = evento.data && evento.data.object;
    if (!s || s.payment_status !== 'paid') { console.log('[stripe] sessão não paga', s && s.id); return res.status(200).end(); }

    const local = await findOrderByMpId(s.id, 'stripe', s.client_reference_id);
    const payment = { id: s.id, provider: 'stripe', reference: s.client_reference_id,
      currency: s.currency, amount_cents: s.amount_total, mpPaymentId: s.payment_intent || s.id };
    validatePayment(local, payment);
    if (local.status === 'paid') return res.status(200).end();

    const creditou = await markPaidAndCredit(local.id, payment);
    console.log('[stripe]', s.id, creditou ? 'creditado' : 'já creditado');
  } catch (err) {
    console.error('[stripe] erro ao processar', err);
    return res.status(500).end();   // a Stripe reenvia; o crédito é idempotente
  }
  return res.status(200).end();
}
