import {ORDER_ID,normalizeCpf} from './pix-validation.js';
let identityCache;
export function pixConfigured() {
  return process.env.MP_MODE === 'live' && /^APP_USR-[A-Za-z0-9-]+$/.test(process.env.MP_ACCESS_TOKEN || '') &&
    /^[1-9][0-9]+$/.test(process.env.MP_USER_ID || '') && /^[1-9][0-9]+$/.test(process.env.MP_APPLICATION_ID || '');
}
async function request(path, body, key) {
  if (!pixConfigured()) throw new Error('pix-not-configured');
  const response = await fetch('https://api.mercadopago.com' + path, {
    method:body ? 'POST' : 'GET', redirect:'error', signal:AbortSignal.timeout(8000),
    headers:{Authorization:'Bearer '+process.env.MP_ACCESS_TOKEN, 'Content-Type':'application/json', ...(key ? {'X-Idempotency-Key':key} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})
  });
  if (!response.ok) throw Object.assign(new Error('pix-provider-unavailable'), {code:'mp-http-'+response.status});
  return response.json();
}
export async function verifyPixMerchant() {
  if (identityCache && identityCache.expires > Date.now() && identityCache.token === process.env.MP_ACCESS_TOKEN) return;
  const user = await request('/users/me');
  if (String(user.id) !== process.env.MP_USER_ID || user.country_id !== 'BR' || !Array.isArray(user.tags) || user.tags.includes('test_user'))
    throw new Error('pix-merchant-mismatch');
  identityCache={expires:Date.now()+300000,token:process.env.MP_ACCESS_TOKEN};
}
export async function fetchPixOrder(id) {
  if (!ORDER_ID.test(id || '')) throw new Error('pix-order-id-invalid');
  await verifyPixMerchant();
  return request('/v1/orders/'+id);
}
export async function cancelPixOrder(id,key) {
  if (!ORDER_ID.test(id || '') || typeof key!=='string' || !/^[a-z0-9-]{1,128}$/.test(key)) throw new Error('pix-cancel-invalid');
  await verifyPixMerchant();
  return request('/v1/orders/'+id+'/cancel',{},key);
}
export async function createPixOrder(order, email, cpf) {
  const identification = {type:'CPF',number:normalizeCpf(cpf)};
  await verifyPixMerchant();
  const amount=(Number(order.amount_cents)/100).toFixed(2);
  return request('/v1/orders', {
    type:'online', processing_mode:'automatic', total_amount:amount, external_reference:order.reference,
    description:`PWU ONLINE - ${order.credits} Pcoins`, payer:{email,identification},
    transactions:{payments:[{amount,payment_method:{id:'pix',type:'bank_transfer'},expiration_time:'PT2H'}]}
  },order.reference);
}
