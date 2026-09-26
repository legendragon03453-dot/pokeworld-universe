import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import { tx } from './gamedb.js';
import { authError, limitAuth } from './email-auth.js';

export function characterInput(body) {
  if (typeof body.name !== 'string' || !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(body.name) || body.name.length < 3 || body.name.length > 20)
    throw authError(400, 'Use um nome de 3 a 20 letras, com espaços simples entre palavras, sem números ou acentos.');
  if (body.sex !== 0 && body.sex !== 1) throw authError(400, 'Escolha a aparência inicial.');
  return {name:body.name.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()), sex:body.sex};
}

export function characterConfig() {
  if (process.env.PWU_CHARACTER_CREATION_ENABLED !== 'true' || process.env.PWU_EMAIL_AUTH_ENABLED !== 'true')
    throw authError(503, 'Criação de personagem temporariamente indisponível.');
  const female = Number(process.env.PWU_CHARACTER_FEMALE_OUTFIT), male = Number(process.env.PWU_CHARACTER_MALE_OUTFIT);
  if (![female,male].every(n => Number.isInteger(n) && n > 0 && n <= 65535))
    throw authError(503, 'Aparências iniciais aguardam configuração pela equipe.');
  return {female,male};
}

export function characterIp(req) {
  let ip = String(req.socket?.remoteAddress || '');
  // Runtime binds loopback only. Nginx must overwrite X-Real-IP.
  if (['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)) ip = String(req.headers['x-real-ip'] || ip);
  ip = ip.replace(/^::ffff:/, '');
  if (!isIP(ip)) throw authError(400, 'Não foi possível identificar a conexão.');
  // TFS getIP()/convertIPToString stores the first IPv4 octet in the low byte.
  const numeric = isIP(ip) === 4 ? ip.split('.').reduce((n,p,i) => n + Number(p) * 256 ** i, 0) : 0;
  return {ip,numeric};
}

export async function verifyCharacterSchema(conn) {
  const [tables] = await conn.execute("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('accounts','players')");
  if (tables.length !== 2 || tables.some(t=>t.ENGINE !== 'InnoDB')) throw authError(503, 'Criação aguardando validação do banco pela equipe.');
  const [indexes] = await conn.execute("SELECT INDEX_NAME,COUNT(*) AS n,MAX(COLUMN_NAME) AS col FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='players' AND NON_UNIQUE=0 GROUP BY INDEX_NAME");
  if (!indexes.some(i=>Number(i.n)===1&&i.col==='name')) throw authError(503, 'Criação aguardando validação de nomes únicos pela equipe.');
  const [columns] = await conn.execute("SELECT COLUMN_NAME,COLUMN_DEFAULT,IS_NULLABLE,EXTRA,COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='players'");
  const supplied = new Set(['name','account_id','lastip','sex','creationdate','looktype','lookbody','lookfeet','lookhead','looklegs','level','experience']);
  if ([...supplied].some(n=>!columns.some(c=>c.COLUMN_NAME.toLowerCase()===n)) || columns.some(c=>c.IS_NULLABLE==='NO'&&c.COLUMN_DEFAULT===null&&!c.EXTRA.includes('auto_increment')&&!supplied.has(c.COLUMN_NAME.toLowerCase())))
    throw authError(503, 'Campos iniciais do personagem aguardam validação pela equipe.');
  if (!columns.find(c=>c.COLUMN_NAME==='name')?.COLLATION_NAME?.endsWith('_ci')) throw authError(503, 'Criação aguardando validação de nomes pela equipe.');
}

export async function createCharacter(accountId, body, req) {
  const config = characterConfig(), input = characterInput(body), address = characterIp(req);
  await limitAuth('character-attempt-account', String(accountId), 10, 900000);
  // Shared database limiter protects concurrent requests and IPv6 too.
  // A failed creation consumes this window: conservative, never bypasses limits.
  await limitAuth('character-create-ip', address.ip, 1, 300000);
  try {
    return await tx(async conn => {
      await verifyCharacterSchema(conn);
      const [accounts] = await conn.execute('SELECT id FROM accounts WHERE id=? FOR UPDATE', [accountId]);
      if (!accounts.length) throw authError(401, 'Conta não encontrada. Entre novamente.');
      const now = Math.floor(Date.now()/1000);
      const [bans] = await conn.execute('SELECT account_id FROM account_bans WHERE account_id=? AND (expires_at=0 OR expires_at>?) LIMIT 1',[accountId,now]);
      if (bans.length) throw authError(403, 'Esta conta não pode criar personagens. Contate o suporte.');
      if (address.numeric) {
        const [ipBans] = await conn.execute('SELECT ip FROM ip_bans WHERE ip=? AND (expires_at=0 OR expires_at>?) LIMIT 1',[address.numeric,now]);
        if (ipBans.length) throw authError(403, 'Esta conexão não pode criar personagens.');
      }
      const [count] = await conn.execute('SELECT COUNT(*) AS n, MAX(creationdate) AS latest FROM players WHERE account_id=?',[accountId]);
      if (Number(count[0].n) >= 8) throw authError(409, 'Limite de 8 personagens por conta.');
      if (count[0].latest != null && Number(count[0].latest) > now-300) throw authError(429, 'Aguarde 5 minutos entre criações de personagem.');
      if (address.numeric) {
        const [recent] = await conn.execute('SELECT id FROM players WHERE lastip=? AND creationdate>? LIMIT 1',[address.numeric,now-300]);
        if (recent.length) throw authError(429, 'Aguarde 5 minutos entre criações nesta conexão.');
      }
      const [existing] = await conn.execute('SELECT id FROM players WHERE name=? LIMIT 1',[input.name]);
      if (existing.length) throw authError(409, 'Este nome já está em uso.');
      // Same fields as native creation; initial level 2 requested for website.
      // A UNIQUE(name) database index is mandatory (deployment preflight).
      const [result] = await conn.execute(
        'INSERT INTO players (name,account_id,lastip,sex,creationdate,looktype,lookbody,lookfeet,lookhead,looklegs,level,experience) VALUES (?,?,?,?,?,?,?,?,?,?,2,100)',
        [input.name,accountId,address.numeric,input.sex,now,input.sex===0?config.female:config.male,randomInt(133),randomInt(133),randomInt(133),randomInt(133)]);
      return {id:result.insertId,name:input.name,level:2};
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw authError(409, 'Este nome já está em uso.');
    throw error;
  }
}
