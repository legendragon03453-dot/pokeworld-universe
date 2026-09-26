export function cents(value) {
  const s = String(value ?? '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) throw new Error('invalid-payment-amount');
  const [whole, fraction = ''] = s.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('invalid-payment-amount');
  return n;
}

export function validatePayment(local, payment) {
  if (!local) throw new Error('payment-order-not-found');
  if (!local.reference || !local.package_id || !Number.isSafeInteger(local.amount_cents) || local.amount_cents <= 0) {
    throw new Error('payment-snapshot-missing-manual-review');
  }
  if (payment.reference !== local.reference || payment.provider !== local.provider ||
      typeof payment.id !== 'string' || !payment.id || payment.id.length > 250 ||
      (local.payment_id && local.payment_id !== payment.id)) throw new Error('payment-binding-mismatch');
  if (String(payment.currency).toUpperCase() !== 'BRL' || local.currency !== 'BRL') throw new Error('payment-currency-mismatch');
  if (!Number.isSafeInteger(payment.amount_cents) || payment.amount_cents !== local.amount_cents) throw new Error('payment-amount-mismatch');
  if (!Number.isSafeInteger(local.coins) || local.coins <= 0) throw new Error('payment-credits-invalid');
}
