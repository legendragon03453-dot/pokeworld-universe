import { randomUUID } from 'node:crypto';
import { q, one, run, tx } from './gamedb.js';
import { cents, validatePayment } from './payment-validation.js';

const columns = 'id, account_id, valor, tipo, currency, payment_id, pwu_package_id, pwu_amount_cents, pwu_reference, pwu_credit_unit, entregue';
function model(r) {
  if (!r) return null;
  return { id: r.id, account_id: r.account_id, credit_unit: r.pwu_credit_unit, coins: Number(r.valor), provider: r.tipo,
    currency: r.currency, payment_id: r.payment_id, package_id: r.pwu_package_id,
    amount_cents: Number(r.pwu_amount_cents), reference: r.pwu_reference,
    status: Number(r.entregue) === 1 ? 'paid' : 'pending' };
}

export async function createLocalOrder({ userId, packageId, amount, coins, provider }) {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('invalid-account');
  if (!['mercadopago', 'stripe'].includes(provider) || !Number.isSafeInteger(coins) || coins <= 0) throw new Error('invalid-order');
  const amountCents = cents(amount);
  const reference = randomUUID();
  // The game's numeric id_pacote is preserved. The website slug has its own column.
  const r = await run(`INSERT INTO historico_pagamentos
    (payment_id, tipo, account_id, player_id, currency, valor, id_pacote, multiplicador, promocional_id, status, entregue, date_created,
     pwu_package_id, pwu_amount_cents, pwu_reference, pwu_credit_unit)
    VALUES ('', ?, ?, NULL, 'BRL', ?, NULL, 1.0, 0, 0, 0, NOW(), ?, ?, ?, 'account_diamond_points')`,
    [provider, userId, coins, packageId, amountCents, reference]);
  return { id: r.insertId, reference, package_id: packageId, amount, coins, status: 'pending' };
}

export async function attachMpOrderId(localOrderId, paymentId, provider) {
  if (typeof paymentId !== 'string' || !paymentId || paymentId.length > 250) throw new Error('invalid-provider-id');
  return tx(async conn => {
    const [rows] = await conn.execute(`SELECT ${columns} FROM historico_pagamentos WHERE id = ? FOR UPDATE`, [localOrderId]);
    const local = model(rows[0]);
    if (!local || local.provider !== provider || (local.payment_id && local.payment_id !== paymentId)) throw new Error('payment-binding-mismatch');
    await conn.execute('UPDATE historico_pagamentos SET payment_id = ? WHERE id = ?', [paymentId, localOrderId]);
  });
}

// The reference must come from a verified webhook or authenticated provider response.
// UUID recovers notifications arriving before the checkout handler saves payment_id.
export async function findOrderByMpId(paymentId, provider, reference) {
  if (typeof reference !== 'string' || !reference) return null;
  const local = model(await one(`SELECT ${columns} FROM historico_pagamentos
    WHERE tipo = ? AND pwu_reference = ? LIMIT 1`, [provider, reference]));
  if (local?.payment_id && local.payment_id !== paymentId) throw new Error('payment-binding-mismatch');
  return local;
}

export async function markPaidAndCredit(localOrderId, payment) {
  return tx(async conn => {
    const [rows] = await conn.execute(`SELECT ${columns} FROM historico_pagamentos WHERE id = ? FOR UPDATE`, [localOrderId]);
    const local = model(rows[0]);
    validatePayment(local, payment);
    if (local.status === 'paid') return false;
    // Old orders are never reinterpreted as purchases of the new currency.
    if (local.credit_unit !== 'account_diamond_points') throw new Error('payment-credit-unit-manual-review');
    const [credited] = await conn.execute('UPDATE accounts SET diamond_points = diamond_points + ? WHERE id = ? AND diamond_points <= 2147483647 - ?', [local.coins, local.account_id, local.coins]);
    if (credited.affectedRows !== 1) throw new Error('payment-account-not-credited');
    const [delivered] = await conn.execute(`UPDATE historico_pagamentos
      SET payment_id = ?, status = 1, entregue = 1, qrcode = ? WHERE id = ? AND entregue = 0`,
      [payment.id, String(payment.mpPaymentId || payment.id).slice(0, 250), localOrderId]);
    if (delivered.affectedRows !== 1) throw new Error('payment-delivery-not-recorded');
    return true;
  });
}

export async function logWebhookEvent({ mpOrderId, action }) {
  try {
    await run(`INSERT INTO historico_mp (payment_id, account_id, valor, multiplicador, promocional_id, status, date_created, create_admin_id)
      VALUES (?, 0, 0, 1, 0, 0, CURDATE(), 0)`, [String(mpOrderId || action || '').slice(0, 250)]);
  } catch { console.warn('[webhook] log indisponível'); }
}

export async function listOrders(accountId, limit = 10) {
  const n = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 10));
  return q(`SELECT id, payment_id, valor, COALESCE(pwu_package_id, CAST(id_pacote AS CHAR)) AS id_pacote,
    tipo, status, entregue, date_created FROM historico_pagamentos
    WHERE account_id = ? AND tipo IN ('mercadopago', 'stripe') ORDER BY id DESC LIMIT ${n}`, [accountId]);
}
