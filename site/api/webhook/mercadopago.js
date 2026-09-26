import { fetchOrder, isPaid } from '../_lib/mercadopago.js';
import { findOrderByMpId, markPaidAndCredit, logWebhookEvent } from '../_lib/orders.js';
import { assinaturaValida, processar } from '../_lib/webhook-core.js';

/** POST /api/webhook/mercadopago?data.id=ORD...&type=order */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const dataId = req.query['data.id'] || null;
  const topic = req.query.type || req.query.topic || null;

  const ok = assinaturaValida({
    xSignature: req.headers['x-signature'], xRequestId: req.headers['x-request-id'],
    dataId, secret: process.env.MP_WEBHOOK_SECRET
  });
  if (!ok) { console.warn('[webhook] assinatura inválida', { dataId }); return res.status(401).end(); }

  await logWebhookEvent({ mpOrderId: dataId, action: (req.body && req.body.action) || topic, payload: req.body || {} });

  // Só nos interessa o tópico de order.
  if (topic !== 'order' || !dataId) return res.status(200).end();

  try {
    const desfecho = await processar(dataId, { fetchOrder, isPaid, findOrderByMpId, markPaidAndCredit });
    console.log('[webhook]', dataId, desfecho);
  } catch (err) {
    console.error('[webhook] erro ao processar', dataId, err);
    return res.status(500).end(); // 500 faz o Mercado Pago reenviar; o crédito é idempotente
  }
  return res.status(200).end();
}
