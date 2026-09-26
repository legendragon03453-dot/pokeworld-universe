/**
 * Stripe via REST (sem SDK, para manter a função leve).
 * A chave secreta fica só em STRIPE_SECRET_KEY, no servidor.
 */
import crypto from 'crypto';

const API = 'https://api.stripe.com/v1';

export function stripeConfigured() {
  return process.env.STRIPE_MODE === 'live' && /^(rk|sk)_live_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || '') &&
    /^whsec_[A-Za-z0-9]+$/.test(process.env.STRIPE_WEBHOOK_SECRET || '');
}

/** Chamada à API da Stripe com corpo em form-urlencoded (o formato que ela usa). */
export async function stripeCall(path, form, { method = 'POST', idempotencyKey } = {}) {
  const headers = {
    Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY,
    'Stripe-Version': '2026-08-26.dahlia',
    'Content-Type': 'application/x-www-form-urlencoded'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const body = form ? new URLSearchParams(Object.entries(form).filter(([,v])=>v!==undefined && v!==null)).toString() : undefined;
  const r = await fetch(API + path, { method, headers, body, signal:AbortSignal.timeout(15000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('stripe-api-failed');
    e.code = String(data.error?.code || data.error?.type || 'provider').replace(/[^a-z_]/g,'').slice(0,80);
    e.status = r.status;
    throw e;
  }
  return data;
}

/**
 * Valida a assinatura do webhook da Stripe.
 * Header: Stripe-Signature: t=1714764000,v1=<hmac>
 * Payload assinado: `${t}.${corpoCru}`  — precisa do corpo CRU, sem parse.
 */
export function assinaturaStripeValida({ header = '', rawBody = '', secret, toleranciaSeg = 300, now = Date.now() }) {
  if (!secret || !header) return false;
  let t = null;
  const v1 = [];
  for (const parte of String(header).split(',')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === 't') t = v;
    if (k === 'v1') v1.push(v);
  }
  if (!t || !/^\d{1,12}$/.test(t) || !v1.length || typeof header !== 'string' || header.length > 2048) return false;

  const esperado = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`, 'utf8').digest('hex');
  const a = Buffer.from(esperado, 'utf8');
  const bateu = v1.some((sig) => {
    const b = Buffer.from(sig, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!bateu) return false;

  // Anti-replay: o t da Stripe vem em segundos.
  return Math.abs(now / 1000 - Number(t)) <= toleranciaSeg;
}

/** Lê o corpo cru da requisição (necessário para validar a assinatura). */
export async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 262144) throw Object.assign(new Error('body-too-large'), {code:'body-too-large'});
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}
