import crypto from 'crypto';

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
    if (k === 'ts') { if (ts !== null) return false; ts = v; }
    if (k === 'v1') { if (hash !== null) return false; hash = v; }
  }
  if (!ts || !hash || !/^(?:\d{10}|\d{13})$/.test(ts) || !/^[0-9a-f]{64}$/.test(hash)) return false;

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

  // Preserve the signed representation; tolerate documented timestamp units.
  const timestamp = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) return false;
  return true;
}

