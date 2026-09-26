/**
 * Conta do jogador — grava direto na tabela `accounts` do banco do jogo.
 * A conta criada aqui é a MESMA que entra no cliente do Pokeworld.
 *
 * POST /api/account { action: 'register' | 'login' | 'password' | 'forgot' | 'reset', ... }
 * GET  /api/account            -> dados da conta + treinadores (Bearer token)
 */
import crypto from 'crypto';
import { gameConfigured, q, one, run, tableExists, tx } from './_lib/gamedb.js';
import { sign, accountFromRequest, hashSenha } from './_lib/session.js';
import { mailConfigured } from './_lib/mail.js';
import { authError, sameSecret, limitAuth, issueCode, consumeCode } from './_lib/email-auth.js';
import { createCharacter } from './_lib/characters.js';
import { totpRequired, totpRecord, setupTotp, consumeTotp } from './_lib/site-totp.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ipDe(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null; }
function apelidoDoAparelho(req) {
  const ua = String(req.headers['user-agent'] || '');
  const so = /Windows/i.test(ua) ? 'Windows' : /Mac OS|Macintosh/i.test(ua) ? 'Mac' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : 'Desconhecido';
  const nav = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /Firefox\//i.test(ua) ? 'Firefox' : 'Navegador';
  return `${nav} no ${so}`;
}

// Device IDs are unguessable browser secrets. Never trust a missing ID or a first device.
function validDevice(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value); }
async function requirePolicy(accountId, conn) {
  const sql = 'SELECT has_authenticator FROM pwu_account_auth_policy WHERE account_id = ? LIMIT 1';
  const policy = conn ? (await conn.execute(sql,[accountId]))[0][0] : await one(sql,[accountId]);
  if (!policy || Number(policy.has_authenticator) !== 0 || policy.has_authenticator == null) {
    throw authError(403, 'Conta com autenticador exige atendimento pelo canal atual de acesso.');
  }
}
async function saveDevice(conn, accountId, deviceId, req) {
  await conn.execute(
    'INSERT INTO site_devices (account_id,device_id,label,last_ip,created_at,last_seen) VALUES (?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE last_seen=NOW(),last_ip=VALUES(last_ip)',
    [accountId,deviceId,apelidoDoAparelho(req),ipDe(req)]
  );
}
async function passwordAccount(email, password) {
  const acc = await one('SELECT id, name, email, password FROM accounts WHERE name = ? OR email = ? LIMIT 1', [email,email]);
  if (!acc || !sameSecret(String(acc.password).toLowerCase(), hashSenha(password))) throw authError(401, 'E-mail ou senha incorretos.');
  await requirePolicy(acc.id);
  return acc;
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b || '{}'); } catch (e) { b = {}; } }
  return b || {};
}

/** Time de pokémon do player: a coluna `pokemons` guarda um JSON do jogo. */
function parseTeam(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 6).map((p) => ({
      name: String(p.name || '').trim(),
      level: Number(p.level || 0),
      boost: Number(p.boost || 0),
      lookType: (p.looktype && p.looktype.lookType) || null
    })).filter((p) => p.name);
  } catch (e) { return []; }
}

async function dadosDaConta(accountId) {
  const acc = await one(
    'SELECT id, name, email, type, premdays, diamond_points, creation, image FROM accounts WHERE id = ? LIMIT 1',
    [accountId]
  );
  if (!acc) return null;

  const players = await q(
    `SELECT p.id, p.name, p.level, p.experience, p.onlinetime, p.looktype, p.pokemons, p.diamond,
            (SELECT COUNT(*) FROM players_online o WHERE o.player_id = p.id) AS online
       FROM players p
      WHERE p.account_id = ? AND p.deletion = 0
      ORDER BY p.level DESC, p.experience DESC`,
    [accountId]
  );

  const factor=await totpRecord(accountId);
  return {
    totp: Number(factor?.enabled)===1,
    totpPendente: totpRequired() && Number(factor?.enabled)!==1,
    totpDisponivel: totpRequired(),
    id: acc.id,
    name: acc.name,
    email: acc.email || acc.name,
    email_masked: String(acc.email || acc.name).replace(/^(.).*(@.*)$/, '$1***$2'),
    coins: Number(acc.diamond_points),
    diamondPoints: Number(acc.diamond_points),
    premdays: Number(acc.premdays || 0),
    plan: Number(acc.premdays || 0) > 0 ? `Premium · ${acc.premdays} dias` : 'Conta Grátis',
    admin: Number(acc.type || 1) >= 5,
    avatar: acc.image || null,
    createdAt: Number(acc.creation || 0),
    trainers: players.map((p) => ({
      id: p.id,
      name: p.name,
      level: Number(p.level || 0),
      experience: Number(p.experience || 0),
      onlinetime: Number(p.onlinetime || 0),
      online: Number(p.online || 0) > 0,
      diamond: Number(p.diamond || 0),
      team: parseTeam(p.pokemons)
    }))
  };
}

export default async function handler(req, res) {
  if (!gameConfigured()) return res.status(503).json({ error: 'banco do jogo não configurado no servidor' });

  const authStartedAt = Date.now();
  try {
    // ---------------- dados da conta logada ----------------
    if (req.method === 'GET') {
      const id = await accountFromRequest(req,{allowEnrollment:true});
      if (!id) return res.status(401).json({ error: 'não autenticado' });
      if (req.previewReadOnly) {
        const policy = await one('SELECT has_authenticator FROM pwu_account_auth_policy WHERE account_id = ? LIMIT 1', [id]);
        if (!policy || policy.has_authenticator == null || Number(policy.has_authenticator) !== 0) return res.status(403).json({ error: 'Autenticador não disponível na prévia. Use o site atual.' });
      }
      const conta = await dadosDaConta(id);
      if (!conta) return res.status(401).json({ error: 'conta não encontrada' });
      return res.status(200).json(conta);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });

    const body = parseBody(req);
    const action = body.action;
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    // Private SSH preview only: no writes, device registration, mail or fallback.
    // Server sets this property; JSON/header input cannot enable it.
    if (req.previewReadOnly) {
      if (action !== 'login') return res.status(403).json({ error: 'Prévia somente leitura.' });
      if (!email || !password || password.length > 1024) return res.status(400).json({ error: 'Informe e-mail e senha.' });
      const acc = await one('SELECT id, password FROM accounts WHERE name = ? OR email = ? LIMIT 1', [email, email]);
      const expected = Buffer.from(String(acc?.password || '').toLowerCase());
      const supplied = Buffer.from(hashSenha(password));
      if (!acc || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      const policy = await one('SELECT has_authenticator FROM pwu_account_auth_policy WHERE account_id = ? LIMIT 1', [acc.id]);
      if (!policy || policy.has_authenticator == null || Number(policy.has_authenticator) !== 0) return res.status(403).json({ error: 'Autenticador não disponível na prévia. Use o site atual.' });
      const conta = await dadosDaConta(acc.id);
      if (!conta) return res.status(401).json({ error: 'Conta não encontrada.' });
      return res.status(200).json({ token: sign(acc.id), account: conta });
    }

    if (['totp-setup','totp-enable','totp-disable'].includes(action)) {
      const id=await accountFromRequest(req,{allowEnrollment:true});
      if (!id) throw authError(401,'Entre novamente para configurar o autenticador.');
      await requirePolicy(id);
      if (action==='totp-disable') throw authError(403,'A verificação em duas etapas é obrigatória. Para recuperar o acesso, contate o suporte.');
      if (action==='totp-setup') {
        const acc=await one('SELECT email,name FROM accounts WHERE id=?',[id]);
        return res.status(200).json(await setupTotp(id,acc.email||acc.name));
      }
      await consumeTotp(id,body.code,true);
      return res.status(200).json({ok:true,token:sign(id,Date.now()+1,true)});
    }

    if (action === 'character-create') {
      const id = await accountFromRequest(req);
      if (!id) throw authError(401, 'Entre na sua conta para criar um personagem.');
      await requirePolicy(id);
      const character = await createCharacter(id, body, req);
      return res.status(201).json({ok:true, character});
    }

    // Full auth requires the explicit activation flag; preview remains read-only.
    if (['register','register-confirm','login','device-confirm','forgot','reset','password'].includes(action)) {
      if (process.env.PWU_EMAIL_AUTH_ENABLED !== 'true') throw authError(503, 'Cadastro e login público aguardam configuração do e-mail.');
      if (email.length > 254 || password.length > 1024) throw authError(400, 'Dados inválidos.');
      await limitAuth('auth-global', 'site', 1000, 3600000);
      await limitAuth('auth-ip', ipDe(req) || 'unknown', 60, 900000);
      await limitAuth('auth-account', email || String(await accountFromRequest(req)), 30, 900000);
    }
    const deviceId = String(body.deviceId || '');
    async function sessionFor(id, mfa=false) {
      const conta = await dadosDaConta(id);
      if (!conta) throw authError(401, 'Conta não encontrada.');
      return res.status(200).json({ token: sign(id, authStartedAt, mfa), account: conta });
    }

    if (action === 'register') {
      if (!EMAIL.test(email) || password.length < 8 || body.terms !== true) throw authError(400, 'Informe e-mail válido, senha de pelo menos 8 caracteres e aceite os termos.');
      if (!validDevice(deviceId)) throw authError(400, 'Identificação do navegador inválida.');
      if (!mailConfigured()) throw authError(503, 'Confirmação por e-mail ainda não configurada.');
      await limitAuth('mail', email, 5, 3600000);
      const exists = await one('SELECT id FROM accounts WHERE name = ? OR email = ? LIMIT 1', [email,email]);
      if (exists) throw authError(409, 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.');
      // No game account or session exists until mailbox possession is proved.
      await issueCode('register', email, email, {email, passwordHash:hashSenha(password), deviceId});
      return res.status(202).json({needsEmail:true, email, message:'Confirme seu e-mail para criar a conta.'});
    }

    if (action === 'register-confirm') {
      if (!EMAIL.test(email) || !validDevice(deviceId) || password.length < 8) throw authError(400, 'Dados de cadastro inválidos.');
      const id = await consumeCode('register', email, body.code, async (conn,pending) => {
        if (pending.email !== email || pending.deviceId !== deviceId || !sameSecret(pending.passwordHash,hashSenha(password))) throw authError(401, 'Solicitação de cadastro diferente. Solicite um novo código.');
        const [existing] = await conn.execute('SELECT id FROM accounts WHERE name=? OR email=? LIMIT 1', [email,email]);
        if (existing.length) throw authError(409, 'Conta já existente. Faça login.');
        const [insert] = await conn.execute(
          "INSERT INTO accounts (name,password,email,creation,type,premdays,pontos,recovery_key,creationIp,authentication) VALUES (?,?,?,?,1,0,0,'',?,0)",
          [email,pending.passwordHash,email,Math.floor(Date.now()/1000),ipDe(req)||'0']
        );
        await saveDevice(conn,insert.insertId,deviceId,req);
        return insert.insertId;
      });
      return sessionFor(id);
    }

    if (action === 'login') {
      if (!email || !password || !validDevice(deviceId)) throw authError(400, 'Informe e-mail e senha e permita o armazenamento do navegador.');
      const acc = await passwordAccount(email,password);
      const factor=await totpRecord(acc.id);
      if (Number(factor?.enabled)===1) {
        if (!body.totp) return res.status(403).json({needsTotp:true,error:'Digite o código do aplicativo autenticador.'});
        try { await consumeTotp(acc.id,body.totp); }
        catch (err) { if (err.authPublic) return res.status(err.status).json({needsTotp:true,error:err.message}); throw err; }
        await tx(conn=>saveDevice(conn,acc.id,deviceId,req));
        return sessionFor(acc.id,true);
      }
      const known = await one('SELECT device_id FROM site_devices WHERE account_id=? AND device_id=? LIMIT 1', [acc.id,deviceId]);
      if (known) return sessionFor(acc.id);
      if (!EMAIL.test(acc.email || acc.name || '')) throw authError(403, 'Esta conta precisa de um e-mail válido. Contate o suporte.');
      await limitAuth('mail', email, 5, 3600000);
      await issueCode('device', acc.id+':'+deviceId, acc.email || acc.name, {accountId:acc.id,passwordHash:acc.password});
      return res.status(403).json({needsDevice:true,email:String(acc.email||acc.name).replace(/^(.).*(@.*)$/,'$1***$2'),error:'Enviamos um código para autorizar este computador.'});
    }

    if (action === 'device-confirm') {
      if (!validDevice(deviceId) || !email || !password) throw authError(400, 'Dados inválidos.');
      const acc = await passwordAccount(email,password);
      if (Number((await totpRecord(acc.id))?.enabled)===1) return res.status(403).json({needsTotp:true,error:'Autenticador ativo. Volte ao login e informe o código do aplicativo.'});
      await consumeCode('device',acc.id+':'+deviceId,body.code,async (conn,pending) => {
        if (pending.accountId !== acc.id || !sameSecret(pending.passwordHash,acc.password)) throw authError(401,'Senha alterada. Faça login novamente.');
        const [locked] = await conn.execute('SELECT password FROM accounts WHERE id=? FOR UPDATE',[acc.id]);
        if (!locked[0] || !sameSecret(locked[0].password,pending.passwordHash)) throw authError(401,'Senha alterada. Faça login novamente.');
        await saveDevice(conn,acc.id,deviceId,req);
      });
      return sessionFor(acc.id);
    }

    if (action === 'forgot') {
      if (!EMAIL.test(email)) throw authError(400, 'Digite um e-mail válido.');
      if (!mailConfigured()) throw authError(503, 'Envio de e-mail indisponível.');
      await limitAuth('mail',email,5,3600000);
      const acc = await one('SELECT id, name, email, password FROM accounts WHERE email=? OR name=? LIMIT 1',[email,email]);
      if (acc) {
        await requirePolicy(acc.id);
        await issueCode('reset',email,acc.email||acc.name,{accountId:acc.id,passwordHash:acc.password});
      }
      return res.status(200).json({ok:true});
    }

    if (action === 'reset') {
      const next = String(body.next || '');
      if (!EMAIL.test(email) || next.length < 8 || next.length > 1024) throw authError(400,'Informe e-mail válido e senha de 8 a 1024 caracteres.');
      await consumeCode('reset',email,body.code,async (conn,pending) => {
        await requirePolicy(pending.accountId,conn);
        const [updated] = await conn.execute('UPDATE accounts SET password=? WHERE id=? AND password=?',[hashSenha(next),pending.accountId,pending.passwordHash]);
        if (updated.affectedRows !== 1) throw authError(401,'Solicitação inválida. Peça outro código.');
        await conn.execute('DELETE FROM site_devices WHERE account_id=?',[pending.accountId]);
        await conn.execute('INSERT INTO pwu_session_epochs (account_id,revoked_at) VALUES (?,?) ON DUPLICATE KEY UPDATE revoked_at=VALUES(revoked_at)',[pending.accountId,Date.now()]);
      });
      return res.status(200).json({ok:true});
    }

    if (action === 'password') {
      const id=await accountFromRequest(req), next=String(body.next||'');
      if (!id) throw authError(401,'Não autenticado.');
      await requirePolicy(id);
      if (next.length<8 || next.length>1024) throw authError(400,'A nova senha precisa ter de 8 a 1024 caracteres.');
      const acc=await one('SELECT password FROM accounts WHERE id=?',[id]);
      if (!acc || !sameSecret(acc.password,hashSenha(password))) throw authError(401,'Senha atual incorreta.');
      await tx(async conn => {
        const [changed] = await conn.execute('UPDATE accounts SET password=? WHERE id=? AND password=?',[hashSenha(next),id,acc.password]);
        if(changed.affectedRows !== 1) throw authError(401,'Senha alterada. Faça login novamente.');
        await conn.execute('DELETE FROM site_devices WHERE account_id=?',[id]);
        await conn.execute('INSERT INTO pwu_session_epochs (account_id,revoked_at) VALUES (?,?) ON DUPLICATE KEY UPDATE revoked_at=VALUES(revoked_at)',[id,Date.now()]);
      });
      return res.status(200).json({ok:true});
    }

    // ---------------- aparelhos autorizados ----------------
    if (action === 'devices') {
      const id = await accountFromRequest(req);
      if (!id) return res.status(401).json({ error: 'não autenticado' });
      if (!(await tableExists('site_devices'))) return res.status(200).json({ devices: [], missing: 'tabela' });
      const lista = await q('SELECT device_id, label, last_ip, created_at, last_seen FROM site_devices WHERE account_id = ? ORDER BY last_seen DESC', [id]);
      return res.status(200).json({ devices: lista, atual: String(body.deviceId || '') });
    }
    if (action === 'device-remove') {
      const id = await accountFromRequest(req);
      if (!id) return res.status(401).json({ error: 'não autenticado' });
      await run('DELETE FROM site_devices WHERE account_id = ? AND device_id = ?', [id, String(body.deviceId || '').slice(0, 64)]);
      return res.status(200).json({ ok: true });
    }

    // ---------------- foto de perfil ----------------
    if (action === 'avatar') {
      const id = await accountFromRequest(req);
      if (!id) return res.status(401).json({ error: 'não autenticado' });
      const v = String(body.avatar || '').trim().slice(0, 255);
      // só caminho interno do site ou https — nada de javascript: nem data:
      if (v && !/^(assets\/[\w./-]+|https:\/\/[\w./%-]+\.(png|jpg|jpeg|webp|gif))$/i.test(v)) {
        return res.status(400).json({ error: 'Use uma imagem do site ou um endereço https terminando em .png, .jpg ou .webp.' });
      }
      await run('UPDATE accounts SET image = ? WHERE id = ?', [v || null, id]);
      return res.status(200).json({ ok: true, avatar: v || null });
    }

    // ---------------- ticket de suporte ----------------
    if (action === 'ticket') {
      const id = await accountFromRequest(req);
      if (!id) return res.status(401).json({ error: 'não autenticado' });
      const titulo = String(body.subject || '').slice(0, 50);
      const descricao = String(body.message || '').trim().slice(0, 200);
      if (descricao.length < 10) return res.status(400).json({ error: 'Escreva pelo menos 10 caracteres.' });
      await run(
        'INSERT INTO suporte (account_id, titulo, descricao, status, date_created) VALUES (?, ?, ?, 0, NOW())',
        [id, titulo || 'Suporte', descricao]
      );
      return res.status(201).json({ ok: true });
    }

    return res.status(400).json({ error: 'ação inválida' });
  } catch (err) {
    if (err.authPublic) return res.status(err.status).json({ error: err.message });
    console.error('[account] request failed', err.code || 'internal');
    return res.status(500).json({ error: 'erro no servidor' });
  }
}
