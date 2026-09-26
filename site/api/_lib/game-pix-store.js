import {randomUUID,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {pool,one,q} from './gamedb.js';

// Only used between committing the local intent and binding the provider ID.
// A crash may leave a retryable intent; no plaintext CPF is kept in the database.
export function payerCipher(hexKey) {
  if (!/^[a-f0-9]{64}$/i.test(hexKey || '')) throw new Error('payer-key-required');
  const key=Buffer.from(hexKey,'hex');
  return {
    seal(value,reference) {
      const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
      c.setAAD(Buffer.from(reference));
      const data=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
      return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');
    },
    open(value,reference) {
      const raw=Buffer.from(value || '','base64');
      if(raw.length<29 || raw.length>2048) throw new Error('payer-data-invalid');
      const c=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));
      c.setAAD(Buffer.from(reference));c.setAuthTag(raw.subarray(12,28));
      return JSON.parse(Buffer.concat([c.update(raw.subarray(28)),c.final()]).toString('utf8'));
    }
  };
}
const columns='o.*,s.state,s.cancel_requested,s.payer_encrypted,s.lease_id';
const join='pwu_pix_orders o JOIN pwu_game_pix_sessions s ON s.reference=o.reference';
export class GamePixStore {
  constructor(cipher) {this.cipher=cipher;}
  read(account,reference) {return one(`SELECT ${columns} FROM ${join} WHERE o.account_id=? AND o.reference=?`,[account,reference]);}
  active(account) {return one(`SELECT ${columns} FROM ${join} WHERE s.active_account=?`,[account]);}
  async balance(account) {const row=await one('SELECT diamond_points AS balance FROM accounts WHERE id=?',[account]);if(!row) throw new Error('account-missing');return Number(row.balance);}
  async create(account,request,cents,credits,cpf) {
    const c=await pool().getConnection();let reference;
    try {
      await c.beginTransaction();
      const [[user]]=await c.execute('SELECT id,email FROM accounts WHERE id=? FOR UPDATE',[account]);
      if(!user || typeof user.email!=='string' || user.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('account-email-invalid');
      const [[hold]]=await c.execute('SELECT COUNT(*) AS n FROM pwu_payment_holds WHERE account_id=? AND resolved_at IS NULL',[account]);
      if(Number(hold.n)) throw new Error('account_review');
      const [[prior]]=await c.execute(`SELECT ${columns} FROM ${join} WHERE o.account_id=? AND o.request_id=?`,[account,request]);
      if(prior && (Number(prior.amount_cents)!==cents || Number(prior.credits)!==credits)) throw new Error('request_conflict');
      const [[active]]=await c.execute(`SELECT ${columns} FROM ${join} WHERE s.active_account=?`,[account]);
      if(prior || active) reference=(prior || active).reference;
      else {
        const [[held]]=await c.execute(`SELECT EXISTS(SELECT 1 FROM pwu_pix_orders o JOIN pwu_pix_reviews r ON r.payment_id=o.payment_id WHERE o.account_id=? AND r.resolved_at IS NULL) OR EXISTS(SELECT 1 FROM pwu_stripe_orders o JOIN pwu_stripe_reviews r ON r.intent_id=o.intent_id WHERE o.account_id=? AND r.resolved_at IS NULL) AS held`,[account,account]);
        if(Number(held.held)) throw new Error('account_review');
        reference=randomUUID();
        await c.execute('INSERT INTO pwu_pix_orders(reference,request_id,account_id,package_id,amount_cents,credits) VALUES(?,?,?,\'custom\',?,?)',[reference,request,account,cents,credits]);
        await c.execute('INSERT INTO pwu_game_pix_sessions(reference,account_id,payer_encrypted) VALUES(?,?,?)',[reference,account,this.cipher.seal({email:user.email,cpf},reference)]);
      }
      await c.commit();return this.read(account,reference);
    } catch(e) {await c.rollback();throw e;} finally {c.release();}
  }
  async requestCancel(account,reference) {
    await q(`UPDATE pwu_game_pix_sessions SET cancel_requested=TRUE WHERE account_id=? AND reference=? AND active_account IS NOT NULL`,[account,reference]);
    return this.read(account,reference);
  }
  async lease(account,reference) {
    const id=randomUUID();
    const r=await q(`UPDATE pwu_game_pix_sessions SET lease_id=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) WHERE account_id=? AND reference=? AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(3))`,[id,account,reference]);
    return r.affectedRows===1 ? id : null;
  }
  async update(account,reference,lease,state,{bound=false}={}) {
    const r=await q(`UPDATE pwu_game_pix_sessions SET state=?,payer_encrypted=IF(?,NULL,payer_encrypted) WHERE account_id=? AND reference=? AND lease_id=? AND lease_until>=UTC_TIMESTAMP(3)`,[state,bound,account,reference,lease]);
    if(r.affectedRows!==1) throw new Error('lease-lost');
  }
  release(account,reference,lease) {return q('UPDATE pwu_game_pix_sessions SET lease_id=NULL,lease_until=NULL WHERE account_id=? AND reference=? AND lease_id=?',[account,reference,lease]);}
}
