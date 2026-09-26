import crypto from 'crypto';
import { tx } from './gamedb.js';
import { mailConfigured, enviarEmail } from './mail.js';

export function authError(status, message) { return Object.assign(new Error(message), { status, authPublic: true }); }
function key(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function digest(subject, code) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw authError(503, 'Confirmação por e-mail ainda não configurada.');
  return crypto.createHmac('sha256', secret).update(subject + ':' + code).digest('hex');
}
export function sameSecret(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
export async function limitAuth(scope, identity, max, milliseconds) {
  const bucket = key(scope + ':' + identity), now = Date.now();
  const allowed = await tx(async conn => {
    await conn.execute('INSERT IGNORE INTO pwu_auth_limits (bucket, hits, reset_at) VALUES (?, 0, ?)', [bucket, now + milliseconds]);
    const [rows] = await conn.execute('SELECT hits, reset_at FROM pwu_auth_limits WHERE bucket = ? FOR UPDATE', [bucket]);
    const old = rows[0], fresh = Number(old.reset_at) <= now;
    if (!fresh && Number(old.hits) >= max) return false;
    await conn.execute('UPDATE pwu_auth_limits SET hits = ?, reset_at = ? WHERE bucket = ?', [fresh ? 1 : Number(old.hits) + 1, fresh ? now + milliseconds : old.reset_at, bucket]);
    return true;
  });
  if (!allowed) throw authError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
export async function issueCode(purpose, identity, email, payload) {
  if (!mailConfigured()) throw authError(503, 'Envio de e-mail indisponível. Tente novamente mais tarde.');
  const subject = key(purpose + ':' + identity), code = String(crypto.randomInt(1000000)).padStart(6, '0');
  const codeHash = digest(subject, code), now = Date.now();
  await tx(async conn => {
    await conn.execute('INSERT IGNORE INTO pwu_auth_challenges (subject,purpose,code_hash,payload,expires_at,sent_at) VALUES (?,?,?,?,0,0)', [subject,purpose,codeHash,'{}']);
    const [rows] = await conn.execute('SELECT sent_at FROM pwu_auth_challenges WHERE subject = ? FOR UPDATE', [subject]);
    if (Number(rows[0].sent_at) + 60000 > now) throw authError(429, 'Aguarde um minuto antes de pedir outro código.');
    await conn.execute('UPDATE pwu_auth_challenges SET code_hash=?, payload=?, attempts=0, expires_at=?, sent_at=?, consumed=0 WHERE subject=?', [codeHash,JSON.stringify(payload),now+900000,now,subject]);
  });
  const title = purpose === 'register' ? 'Confirme seu cadastro' : purpose === 'reset' ? 'Redefina sua senha' : 'Autorize este dispositivo';
  try {
    await enviarEmail({para:email, assunto:title+' — Pokeworld Universe', html:`<h2>${title}</h2><p>Seu código é <b>${code}</b>.</p><p>Válido por 15 minutos. Não compartilhe este código. Se não solicitou, ignore este e-mail.</p>`});
  } catch {
    // Invalidate only this send, not a newer concurrently issued challenge.
    await tx(conn => conn.execute('UPDATE pwu_auth_challenges SET consumed=1 WHERE subject=? AND code_hash=?', [subject,codeHash]));
    throw authError(503, 'Não foi possível enviar o e-mail. Nenhum acesso foi liberado.');
  }
}
export async function consumeCode(purpose, identity, code, callback) {
  if (!/^\d{6}$/.test(String(code || ''))) throw authError(400, 'Digite o código de seis dígitos.');
  const subject = key(purpose + ':' + identity), supplied = digest(subject, code);
  const result = await tx(async conn => {
    const [rows] = await conn.execute('SELECT * FROM pwu_auth_challenges WHERE subject=? FOR UPDATE', [subject]);
    const record = rows[0];
    if (!record || Number(record.consumed) || Number(record.expires_at) <= Date.now() || Number(record.attempts) >= 5) return { invalid:true };
    await conn.execute('UPDATE pwu_auth_challenges SET attempts=attempts+1 WHERE subject=?', [subject]);
    if (!sameSecret(record.code_hash, supplied)) return { invalid:true };
    // The write (account creation/password/device) and consumption commit together.
    const value = await callback(conn, JSON.parse(record.payload));
    await conn.execute('UPDATE pwu_auth_challenges SET consumed=1 WHERE subject=?', [subject]);
    return { value };
  });
  if (result.invalid) throw authError(401, 'Código inválido, expirado ou limite de tentativas atingido. Peça outro código.');
  return result.value;
}
