// Integration for the existing host: app codes supplement verified email.
// A code cannot replace the game's existing authenticator policy.
import crypto from 'node:crypto';
import { one, run, tx } from './gamedb.js';
import { authError, limitAuth } from './email-auth.js';
import { novoSegredo, codigoTotp, otpauthUrl } from './totp.js';

export const totpRequired = () => process.env.PWU_TOTP_REQUIRED === 'true';
export async function totpRecord(id) {
  if (!totpRequired()) return null;
  return one('SELECT secret,enabled,last_step FROM site_totp WHERE account_id=?',[id]);
}
export function matchingStep(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const step=Math.floor(now/30000);
  for (const delta of [0,-1,1]) {
    if (crypto.timingSafeEqual(Buffer.from(codigoTotp(secret,step+delta)),Buffer.from(code))) return step+delta;
  }
  return null;
}
export async function setupTotp(id, email) {
  if (!totpRequired()) throw authError(503,'Autenticador por aplicativo aguarda ativação pela equipe.');
  await limitAuth('totp-setup',String(id),5,900000);
  // An existing enabled secret must NEVER be reset through the setup route.
  await run('INSERT IGNORE INTO site_totp (account_id,secret,enabled,created_at,last_step) VALUES (?,?,0,NOW(),-1)',[id,novoSegredo()]);
  const row=await totpRecord(id);
  if (!row || Number(row.enabled)!==0) throw authError(409,'Autenticador já ativo. Faça login com o código do aplicativo.');
  return {secret:row.secret,otpauth:otpauthUrl(row.secret,email)};
}
export async function consumeTotp(id, code, enabling=false) {
  if (!totpRequired()) throw authError(503,'Autenticador por aplicativo indisponível.');
  await limitAuth('totp-attempt',String(id),10,300000);
  return tx(async conn => {
    const [rows]=await conn.execute('SELECT secret,enabled,last_step FROM site_totp WHERE account_id=? FOR UPDATE',[id]);
    const row=rows[0];
    if (!row || Number(row.enabled)!==(enabling?0:1)) throw authError(409,enabling?'Gere o QR Code primeiro, ou faça login novamente.':'Faça login novamente.');
    const step=matchingStep(row.secret,code);
    if (step===null || step<=Number(row.last_step)) throw authError(401,'Código inválido ou já utilizado. Aguarde o próximo código do aplicativo.');
    await conn.execute('UPDATE site_totp SET enabled=1,last_step=? WHERE account_id=?',[step,id]);
    if (enabling) await conn.execute('INSERT INTO pwu_session_epochs (account_id,revoked_at) VALUES (?,?) ON DUPLICATE KEY UPDATE revoked_at=VALUES(revoked_at)',[id,Date.now()]);
    return true;
  });
}
