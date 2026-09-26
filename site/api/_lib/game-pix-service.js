import {normalizeCpf,UUID,validatePixOrder} from './pix-validation.js';
import {bonusPctFor} from './packages.js';

export function gameInput(body) {
  if(!body || typeof body!=='object' || Array.isArray(body)) throw new Error('invalid_request');
  const fields={quote:['action','amountCents'],create:['action','requestId','amountCents','cpf'],status:['action','orderId'],cancel:['action','orderId'],recover:['action']};
  const keys=fields[body.action];
  if(!keys || Object.keys(body).some(k=>!keys.includes(k)) || keys.some(k=>!Object.hasOwn(body,k))) throw new Error('invalid_request');
  if(['quote','create'].includes(body.action) && (!Number.isSafeInteger(body.amountCents) || body.amountCents<1000 || body.amountCents>2000000)) throw new Error('invalid_amount');
  if(body.action==='create') {if(!UUID.test(body.requestId || '')) throw new Error('invalid_request');normalizeCpf(body.cpf);}
  if(['status','cancel'].includes(body.action) && !UUID.test(body.orderId || '')) throw new Error('invalid_order');
  return body;
}
export function quote(cents) {
  const bonusPct=bonusPctFor(cents/100);
  return {amountCents:cents,points:Math.floor(cents*(100+bonusPct)/10000),bonusPct};
}
export class GamePixService {
  constructor({store,provider,ledger,identity,test=false}) {Object.assign(this,{store,provider,ledger,identity,test});}
  async handle(account,raw) {
    if(!Number.isSafeInteger(account) || account<1) throw new Error('invalid_account');
    const input=gameInput(raw), action=input.action;
    if(action==='quote') return {action,test:this.test,...quote(input.amountCents)};
    let local;
    if(action==='create') local=await this.store.create(account,input.requestId,input.amountCents,quote(input.amountCents).points,normalizeCpf(input.cpf));
    else if(action==='recover') local=await this.store.active(account);
    else local=await this.store.read(account,input.orderId);
    if(!local) {
      if(action!=='recover') throw new Error('order_not_found');
      return {action:'recover',test:this.test,balance:await this.store.balance(account)};
    }
    if(action==='cancel') local=await this.store.requestCancel(account,local.reference);
    return {action:'order',test:this.test,order:await this.reconcile(account,local.reference)};
  }
  async reconcile(account,reference) {
    const lease=await this.store.lease(account,reference);
    if(!lease) throw new Error('processing');
    try {
      let local=await this.store.read(account,reference);
      if(!local) throw new Error('order_not_found');
      // Receipts are authoritative even when a previous process died after crediting.
      if(local.fulfilled_at) {
        await this.store.update(account,reference,lease,'paid',{bound:true});
        return await this.view(local,'paid');
      }
      if(['cancelled','expired','review'].includes(local.state)) return await this.view(local,local.state);
      let remote;
      if(local.provider_order_id) remote=await this.provider.fetch(local.provider_order_id);
      else {
        const payer=this.store.cipher.open(local.payer_encrypted,reference);
        remote=await this.provider.create(local,payer.email,payer.cpf);
      }
      validatePixOrder(remote,local,this.identity);
      await this.ledger.bind(account,reference,remote.id);
      await this.store.update(account,reference,lease,'pending',{bound:true});
      local=await this.store.read(account,reference);
      if(local.cancel_requested && ['created','action_required'].includes(remote.status)) {
        await this.store.update(account,reference,lease,'cancelling',{bound:true});
        // Stable key across retries/restarts. Failure is uncertain, never a local cancellation.
        try {await this.provider.cancel(remote.id,reference+'-cancel');} catch {}
        remote=await this.provider.fetch(remote.id);
        validatePixOrder(remote,local,this.identity);
      }
      const payment=remote.transactions.payments[0];
      const review=[remote.status,remote.status_detail,payment.status,payment.status_detail].some(s=>/refund|chargeback|charged_back|dispute/.test(s || ''));
      let status='pending';
      if(review) {
        await this.ledger.flag('game_'+reference.replaceAll('-',''),payment.id,'payment_review');status='review';
      } else if(remote.status==='processed' && remote.status_detail==='accredited') {
        validatePixOrder(remote,local,{...this.identity,paid:true});
        const result=await this.ledger.fulfill(local,remote,'game_'+reference.replaceAll('-',''));
        if(!result || ![0,1].includes(Number(result.credited))) throw new Error('receipt-missing');
        status='paid';
      } else if(['canceled','expired'].includes(remote.status) && payment.status===remote.status &&
        Number(remote.total_paid_amount || 0)===0 && Number(payment.paid_amount || 0)===0) {
        status=remote.status==='canceled'?'cancelled':'expired';
      }
      await this.store.update(account,reference,lease,status==='pending' && local.cancel_requested ? 'cancelling':status,{bound:true});
      return await this.view(local,status,remote);
    // Await the view before releasing the lease: its validation may reject.
    // Otherwise a rejection can go unhandled while async cleanup is pending.
    } finally {await this.store.release(account,reference,lease);}
  }
  async view(local,status,remote) {
    const answer={id:local.reference,status,...quote(Number(local.amount_cents)),points:Number(local.credits),balance:await this.store.balance(Number(local.account_id))};
    if(status==='pending' && !local.cancel_requested) {
      const payment=remote?.transactions?.payments?.[0], qr=payment?.payment_method?.qr_code;
      if(remote?.status!=='action_required' || remote.status_detail!=='waiting_transfer' ||
        typeof qr!=='string' || qr.length<20 || qr.length>4096 || !/^[\x20-\x7e]+$/.test(qr)) throw new Error('provider-pending');
      const created=Date.parse(remote.created_date);
      const duration=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(payment.expiration_time || '');
      const explicit=Date.parse(payment.date_of_expiration || remote.expiration_date || '');
      const expires=Number.isFinite(explicit)?explicit:duration && Number.isFinite(created)?created+(Number(duration[1]||0)*3600+Number(duration[2]||0)*60+Number(duration[3]||0))*1000:NaN;
      // Display only an expiry based on provider data, never expire/cancel in the UI.
      answer.qrCode=qr;
      if(Number.isFinite(expires)) answer.expiresAt=Math.floor(expires/1000);
    }
    return answer;
  }
}
