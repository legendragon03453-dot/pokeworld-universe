import { cents } from './payment-validation.js';
import { checkoutInput as paymentInput } from './stripe-live-validation.js';
export { UUID } from './stripe-live-validation.js';
export function normalizeCpf(value) {
  if (typeof value !== 'string' || !/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) throw new Error('invalid-cpf');
  const cpf = value.replace(/\D/g, '');
  if (/^(\d)\1{10}$/.test(cpf)) throw new Error('invalid-cpf');
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    if ((sum * 10 % 11) % 10 !== Number(cpf[length])) throw new Error('invalid-cpf');
  }
  return cpf;
}
export function checkoutInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid-input');
  const {cpf, ...order} = body;
  return {...paymentInput(order), cpf: normalizeCpf(cpf)};
}
export const ORDER_ID = /^ORD(?!TST)[A-Z0-9]{26}$/;
export const PAYMENT_ID = /^PAY[A-Z0-9]{26}$/;
export function validatePixOrder(remote, local, {userId, applicationId, test = false, paid = false} = {}) {
  const payments = remote?.transactions?.payments;
  const idPattern = test ? /^ORDTST[A-Z0-9]{26}$/ : ORDER_ID;
  if (!local || !remote || !idPattern.test(remote.id || '') || remote.type !== 'online' || remote.processing_mode !== 'automatic' ||
      !/^[1-9][0-9]+$/.test(String(userId || '')) || !/^[1-9][0-9]+$/.test(String(applicationId || '')) ||
      String(remote.user_id) !== String(userId) || String(remote.integration_data?.application_id) !== String(applicationId) ||
      remote.country_code !== 'BRA' || remote.currency !== 'BRL' || remote.external_reference !== local.reference ||
      (local.provider_order_id && local.provider_order_id !== remote.id) ||
      cents(remote.total_amount) !== Number(local.amount_cents) || !Array.isArray(payments) || payments.length !== 1)
    throw new Error('pix-order-mismatch');
  const p = payments[0];
  if (!PAYMENT_ID.test(p.id || '') || (local.payment_id && local.payment_id !== p.id) ||
      p.payment_method?.id !== 'pix' || p.payment_method?.type !== 'bank_transfer' || cents(p.amount) !== Number(local.amount_cents))
    throw new Error('pix-payment-mismatch');
  if (paid && (remote.status !== 'processed' || remote.status_detail !== 'accredited' ||
      p.status !== 'processed' || p.status_detail !== 'accredited' || cents(p.paid_amount) !== Number(local.amount_cents) || cents(remote.total_paid_amount) !== Number(local.amount_cents)))
    throw new Error('pix-not-paid');
  return remote;
}
export function pixTicketUrl(value, {test = false} = {}) {
  let u; try {u = new URL(value);} catch {throw new Error('pix-url-invalid');}
  const path = test ? /^\/sandbox\/payments\/[0-9]+\/ticket$/ : /^\/payments\/[0-9]+\/ticket$/;
  if (u.protocol !== 'https:' || u.hostname !== 'www.mercadopago.com.br' || u.port || u.username || u.password || !path.test(u.pathname))
    throw new Error('pix-url-invalid');
  return u.href;
}
