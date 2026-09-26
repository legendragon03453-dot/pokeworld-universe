import crypto from 'crypto';
import { cents, validatePayment } from './payment-validation.js';

/**
 * Valida a assinatura do webhook do Mercado Pago.
 *   x-signature:  ts=1742505638683,v1=ced36ab6...
 *   x-request-id: <uuid>
 *   ?data.id=ORD01M28P44G5FG8RJPM579EH56FV
 * Manifest assinado:  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * PEGADINHA: o data.id precisa ir em MINÚSCULO. Ids de order vêm em caixa alta
 * e o Mercado Pago assina a versão minúscula. Sem o toLowerCase, tudo dá 401.
 */
export function assinaturaValida({ xSignature = '', xRequestId = '', dataId, secret, now = Date.now() }) {
  if (!secret) return false;
  let ts = null, hash = null;
  for (const part of String(xSignature).split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 'ts') ts = v;
    if (k === 'v1') hash = v;
  }
  if (!ts || !hash || !/^\d+$/.test(ts)) return false;

  const partes = [];
  if (dataId) partes.push(`id:${String(dataId).toLowerCase()}`);
  if (xRequestId) partes.push(`request-id:${xRequestId}`);
  partes.push(`ts:${ts}`);
  const manifest = partes.join(';') + ';';

  const calculado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(calculado, 'utf8');
  const b = Buffer.from(hash, 'utf8');
  if (a.length !== b.length) return false;            // timingSafeEqual explode com tamanhos diferentes
  if (!crypto.timingSafeEqual(a, b)) return false;

  // Anti-replay: ts vem em milissegundos. Tolerância de 5 minutos.
  if (Math.abs(now - Number(ts)) > 5 * 60 * 1000) return false;
  return true;
}

/**
 * Processa uma notificação de order. Dependências injetadas para poder testar
 * os cenários do README sem banco nem Mercado Pago.
 * Devolve uma string com o desfecho (só para log/teste).
 */
export async function processar(mpOrderId, { fetchOrder, isPaid, findOrderByMpId, markPaidAndCredit }) {
  // 1. NUNCA confie no corpo do webhook. Pergunte pro Mercado Pago.
  const order = await fetchOrder(mpOrderId);
  if (!isPaid(order)) return 'nao-pago';

  // 2. Acha o pedido local.
  if (order.id !== mpOrderId) throw new Error('payment-binding-mismatch');
  const local = await findOrderByMpId(mpOrderId, 'mercadopago', order.external_reference);
  const payment = { id: mpOrderId, provider: 'mercadopago', reference: order.external_reference,
    currency: order.currency, amount_cents: cents(order.total_paid_amount),
    mpPaymentId: order.transactions?.payments?.[0]?.id ?? null };
  validatePayment(local, payment);

  // 3. Idempotência: se já pagou, sai sem creditar de novo.
  if (local.status === 'paid') return 'ja-creditado';

  // Lock + validation + account credit + delivered flag in one transaction.
  const creditou = await markPaidAndCredit(local.id, payment);
  return creditou ? 'creditado' : 'ja-creditado';
}
