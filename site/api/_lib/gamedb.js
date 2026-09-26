/**
 * Conexão com o banco do servidor do jogo (MariaDB/MySQL — o mesmo `poke`
 * que o OTServ usa). É a fonte de verdade de contas, players, ranking,
 * notícias, loja e pagamentos.
 *
 * As credenciais vivem só em variáveis de ambiente do servidor:
 *   GAME_DB_HOST, GAME_DB_PORT, GAME_DB_USER, GAME_DB_PASSWORD, GAME_DB_NAME
 */
import mysql from 'mysql2/promise';

let _pool = null;

export function gameConfigured() {
  return !!(process.env.GAME_DB_HOST && process.env.GAME_DB_USER && process.env.GAME_DB_NAME);
}

export function pool() {
  if (!gameConfigured()) throw new Error('banco do jogo não configurado');
  if (!_pool) {
    _pool = mysql.createPool({
      host: process.env.GAME_DB_HOST,
      port: Number(process.env.GAME_DB_PORT || 3306),
      user: process.env.GAME_DB_USER,
      password: process.env.GAME_DB_PASSWORD || '',
      database: process.env.GAME_DB_NAME,
      waitForConnections: true,
      connectionLimit: 3,          // serverless: poucas conexões por instância
      enableKeepAlive: true,
      charset: 'utf8mb4',
      timezone: 'Z',
      ssl: process.env.GAME_DB_SSL === 'true' ? {
        rejectUnauthorized: true,
        ...(process.env.GAME_DB_SSL_CA ? { ca: process.env.GAME_DB_SSL_CA.replace(/\\n/g, '\n') } : {})
      } : undefined
    });
  }
  return _pool;
}

/** SELECT que devolve linhas. */
export async function q(sql, params = []) {
  const [rows] = await pool().execute(sql, params);
  return rows;
}

/** SELECT de uma linha só (ou null). */
export async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

/** INSERT/UPDATE/DELETE: devolve { affectedRows, insertId }. */
export async function run(sql, params = []) {
  const [res] = await pool().execute(sql, params);
  return res;
}

/** Executa dentro de uma transação (usado no crédito de coins). */
export async function tx(fn) {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    conn.release();
  }
}

/** true se a tabela existe no banco (usada para recursos opcionais). */
export async function tableExists(name) {
  const r = await one('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [name]);
  return !!(r && Number(r.n) > 0);
}
