import { q } from './gamedb.js';
async function call(name, args) {
  const rows = await q(`CALL pwu_stripe_${name}(${args.map(() => '?').join(',')})`, args);
  return Array.isArray(rows[0]) ? rows[0][0] || null : null;
}
export const createOrder = (account, request, pkg, amount, credits) => call('create', [account, request, pkg, amount, credits]);
export const readOrder = reference => call('read', [reference]);
export const bindOrder = (account, reference, session) => call('bind', [account, reference, session]);
export const flagPayment = (event, intent, type) => call('flag', [event,intent,type]);
export const fulfillOrder = (order, session, event) => call('fulfill', [order.reference, Number(order.account_id), session.id, event,
  Number(session.amount_total), session.currency, session.payment_intent]);
