import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {GamePixService,quote,gameInput} from '../site/api/_lib/game-pix-service.js';
import {GamePixStore,payerCipher} from '../site/api/_lib/game-pix-store.js';
import {pool,q,one} from '../site/api/_lib/gamedb.js';
import * as ledger from '../site/api/_lib/pix-orders.js';
import {createGameBridge} from './fixtures/legacy-private-bridge.mjs';

assert.equal(process.env.GAME_DB_HOST,'127.0.0.1');assert.equal(process.env.GAME_DB_PORT,'13316');
assert.match(process.env.GAME_DB_NAME,/^pwu_release_[a-f0-9]{10}$/);
// No provider networking is used by these tests.
globalThis.fetch=async()=>{throw new Error('External fetch forbidden in local integration tests');};
const cipher=payerCipher(process.env.PWU_GAME_PIX_PAYER_KEY),store=new GamePixStore(cipher);
let sequence=0,accounts=0;
const reports=[];
after(async()=>{await pool().end();});
function fixture() {
  const orders=new Map(),byRef=new Map();let creates=0,cancels=0,lost=false,mode='normal';
  const provider={
    async create(local,email,cpf) {
      assert.match(email,/@example\.invalid$/);assert.equal(cpf,'52998224725');
      let remote=byRef.get(local.reference);
      if(!remote) {
        const tag=String(++sequence).padStart(26,'0');creates++;
        remote={id:'ORD'+tag,type:'online',processing_mode:'automatic',country_code:'BRA',currency:'BRL',user_id:'123',integration_data:{application_id:'456'},external_reference:local.reference,total_amount:(Number(local.amount_cents)/100).toFixed(2),total_paid_amount:'0.00',status:'action_required',status_detail:'waiting_transfer',created_date:new Date().toISOString(),transactions:{payments:[{id:'PAY'+tag,amount:(Number(local.amount_cents)/100).toFixed(2),paid_amount:'0.00',status:'action_required',status_detail:'waiting_transfer',expiration_time:'PT2H',payment_method:{id:'pix',type:'bank_transfer',qr_code:'PWU TEST ONLY DO NOT PAY '+local.reference}}]}};
        byRef.set(local.reference,remote);orders.set(remote.id,remote);
      }
      if(mode==='lost-create' && !lost) {lost=true;throw new Error('lost-create-response');}
      return structuredClone(remote);
    },
    async fetch(id) {const remote=orders.get(id);assert(remote);if(mode==='fetch-down') throw new Error('provider-down');return structuredClone(remote);},
    async cancel(id,key) {
      const remote=orders.get(id);assert.equal(key,remote.external_reference+'-cancel');cancels++;
      if(mode==='cancel-down') throw new Error('timeout');
      if(mode==='pay-on-cancel') pay(remote);
      else {remote.status='canceled';remote.status_detail='canceled_transaction';Object.assign(remote.transactions.payments[0],{status:'canceled',status_detail:'canceled_transaction'});}
      if(mode==='lost-cancel') throw new Error('cancel-response-lost');
      return structuredClone(remote);
    }
  };
  const api=new GamePixService({store,provider,ledger:{bind:ledger.bindOrder,fulfill:ledger.fulfillOrder,flag:ledger.flagPayment},identity:{userId:'123',applicationId:'456'},test:true});
  const account=++accounts;
  return {api,provider,account,orders,byRef,setMode:v=>mode=v,counts:()=>({creates,cancels}),create: (requestId=randomUUID(),amountCents=15000)=>api.handle(account,{action:'create',requestId,amountCents,cpf:'52998224725'})};
}
function pay(r) {r.status='processed';r.status_detail='accredited';r.total_paid_amount=r.total_amount;Object.assign(r.transactions.payments[0],{status:'processed',status_detail:'accredited',paid_amount:r.total_amount});}
const balance=async account=>Number((await one('SELECT diamond_points AS n FROM accounts WHERE id=?',[account])).n);
test('TLS verified and isolated database',async()=>{const row=await one("SHOW SESSION STATUS LIKE 'Ssl_cipher'");assert(row.Value);assert.equal((await one('SELECT @@port AS port')).port,13316);});

test('concurrent refund review and first credit are serialized per payment',async()=>{
  for(let i=0;i<10;i++) {
    const f=fixture(),order=(await f.create()).order,r=[...f.orders.values()][0];pay(r);
    const local=await store.read(f.account,order.id),id=r.transactions.payments[0].id;
    const credit=()=>ledger.fulfillOrder(local,r,'race_credit_'+i);
    const review=()=>ledger.flagPayment('race_review_'+i,id,'payment_review');
    const results=await Promise.allSettled(i%2?[credit(),review()]:[review(),credit()]);
    assert.equal(results[i%2?1:0].status,'fulfilled');
    const b=await balance(f.account);
    assert([0,168].includes(b));
    if(b===168) {
      const hold=await one('SELECT account_id FROM pwu_payment_holds WHERE payment_id=? AND resolved_at IS NULL',[id]);
      assert.equal(hold.account_id,f.account);
      await assert.rejects(q("INSERT INTO pwu_diamond_operations(operation_id,source_account,amount,reason) VALUES(?,?,1,'shop')",[randomUUID(),f.account]));
    } else await assert.rejects(credit());
  }
});
test('server calculates all six packages and arbitrary amount',()=>{for(const [c,n] of [[10000,108],[15000,168],[20000,236],[40000,500],[100000,1280],[150000,1950],[13000,140]]) assert.equal(quote(c).points,n);});
test('forged amounts, accounts, credits and malformed inputs never reach creation',()=>{
  for(const x of [null,[],{},1,'a',{action:'credit'},{action:'create',requestId:randomUUID(),amountCents:1000,cpf:'52998224725',account:2},{action:'quote',amountCents:1000,points:999}]) assert.throws(()=>gameInput(x));
  for(const n of [0,-1,999,2000001,1.1,NaN,Infinity,'1000',null]) assert.throws(()=>gameInput({action:'quote',amountCents:n}));
  for(const cpf of ['11111111111','52998224724',null,{}]) assert.throws(()=>gameInput({action:'create',requestId:randomUUID(),amountCents:1000,cpf}));
});
test('payer encryption authenticates payload and order binding',()=>{
  const id=randomUUID(),sealed=cipher.seal({cpf:'52998224725'},id);
  assert(!sealed.includes('52998224725'));assert.deepEqual(cipher.open(sealed,id),{cpf:'52998224725'});
  assert.throws(()=>cipher.open(sealed,randomUUID()));assert.throws(()=>payerCipher('bad'));
  const modified=Buffer.from(sealed,'base64');modified[30]^=1;assert.throws(()=>cipher.open(modified.toString('base64'),id));
});
test('create -> cancel -> reopen creates a distinct order',async()=>{
  const f=fixture(),first=(await f.create()).order;assert.equal(first.points,168);assert(first.qrCode);assert(first.expiresAt>Date.now()/1000);
  const cancelled=await f.api.handle(f.account,{action:'cancel',orderId:first.id});assert.equal(cancelled.order.status,'cancelled');assert(!cancelled.order.qrCode);
  assert.equal((await f.api.handle(f.account,{action:'recover'})).action,'recover');
  const second=(await f.create()).order;assert.notEqual(first.id,second.id);assert.equal(f.counts().creates,2);assert.equal(await balance(f.account),0);
});
test('concurrent creation has one order, one active session, no credits',async()=>{
  const f=fixture(),request=randomUUID();const results=await Promise.allSettled(Array.from({length:20},()=>f.create(request)));
  assert(results.some(r=>r.status==='fulfilled'));assert.equal(f.counts().creates,1);
  const rows=await q('SELECT * FROM pwu_game_pix_sessions WHERE account_id=?',[f.account]);assert.equal(rows.length,1);assert.equal(rows[0].payer_encrypted,null);
  assert.equal(await balance(f.account),0);
});
test('two distinct requests cannot create two payable QRs simultaneously',async()=>{
  const f=fixture();await Promise.allSettled(Array.from({length:15},()=>f.create()));assert.equal(f.counts().creates,1);
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM pwu_game_pix_sessions WHERE active_account=?',[f.account])).n),1);
});
test('request mutation and cross-account cancel/read are refused',async()=>{
  const f=fixture(),request=randomUUID(),order=(await f.create(request)).order;
  await assert.rejects(f.create(request,20000),/request_conflict/);
  for(const action of ['status','cancel']) await assert.rejects(f.api.handle(f.account+50,{action,orderId:order.id}),/order_not_found/);
  assert.equal(f.counts().cancels,0);
});
test('lost create response recovers the same provider order after service restart',async()=>{
  const f=fixture();f.setMode('lost-create');await assert.rejects(f.create(),/lost-create-response/);
  const local=await store.active(f.account);assert(local.payer_encrypted);assert(!local.payer_encrypted.includes('52998224725'));
  const restarted=new GamePixService({...f.api,store:new GamePixStore(cipher)});
  const recovered=await restarted.handle(f.account,{action:'recover'});assert.equal(recovered.order.id,local.reference);assert.equal(f.counts().creates,1);
  assert.equal((await store.read(f.account,local.reference)).payer_encrypted,null);
});
test('close before binding retries original create then cancels it',async()=>{
  const f=fixture();f.setMode('lost-create');await assert.rejects(f.create());const local=await store.active(f.account);
  const reply=await f.api.handle(f.account,{action:'cancel',orderId:local.reference});assert.equal(reply.order.status,'cancelled');assert.equal(f.counts().creates,1);assert.equal(await balance(f.account),0);
});
test('lost cancel response reconciles authoritative cancellation',async()=>{
  const f=fixture(),order=(await f.create()).order;f.setMode('lost-cancel');assert.equal((await f.api.handle(f.account,{action:'cancel',orderId:order.id})).order.status,'cancelled');
});
test('uncertain cancellation keeps the original session and forbids a new QR',async()=>{
  const f=fixture(),order=(await f.create()).order;f.setMode('cancel-down');
  const r=await f.api.handle(f.account,{action:'cancel',orderId:order.id});assert.equal(r.order.status,'pending');assert(!r.order.qrCode);
  const again=await f.create();assert.equal(again.order.id,order.id);assert.equal(f.counts().creates,1);
  f.setMode('normal');assert.equal((await f.api.handle(f.account,{action:'recover'})).order.status,'cancelled');
});
test('payment winning the cancellation race credits once',async()=>{
  const f=fixture(),order=(await f.create()).order;f.setMode('pay-on-cancel');
  assert.equal((await f.api.handle(f.account,{action:'cancel',orderId:order.id})).order.status,'paid');
  for(let i=0;i<10;i++) assert.equal((await f.api.handle(f.account,{action:'status',orderId:order.id})).order.status,'paid');
  assert.equal(await balance(f.account),168);assert.equal(Number((await one('SELECT COUNT(*) AS n FROM pwu_diamond_operations WHERE target_account=?',[f.account])).n),1);
});
test('webhook and poll concurrency converge on a single wallet credit',async()=>{
  const f=fixture(),order=(await f.create()).order,remote=[...f.orders.values()][0];pay(remote);
  const local=await store.read(f.account,order.id);
  await Promise.allSettled([...Array.from({length:20},(_,i)=>ledger.fulfillOrder(local,remote,'test_'+i)),...Array.from({length:10},()=>f.api.handle(f.account,{action:'status',orderId:order.id}))]);
  assert.equal((await f.api.handle(f.account,{action:'status',orderId:order.id})).order.status,'paid');assert.equal(await balance(f.account),168);
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM historico_pagamentos WHERE account_id=?',[f.account])).n),1);
});
test('provider amount/merchant/status tampering fails closed',async()=>{
  for(const mutate of [r=>r.total_amount='1.00',r=>r.user_id='999',r=>r.transactions.payments[0].paid_amount='1.00',r=>r.external_reference=randomUUID()]) {
    const f=fixture(),order=(await f.create()).order,r=[...f.orders.values()][0];pay(r);mutate(r);
    await assert.rejects(f.api.handle(f.account,{action:'status',orderId:order.id}));assert.equal(await balance(f.account),0);
  }
});
test('receipt committed before process failure is recovered without provider calls',async()=>{
  const f=fixture(),order=(await f.create()).order,r=[...f.orders.values()][0];pay(r);await ledger.fulfillOrder(await store.read(f.account,order.id),r,'lost_response');f.setMode('fetch-down');
  assert.equal((await f.api.handle(f.account,{action:'status',orderId:order.id})).order.status,'paid');assert.equal(await balance(f.account),168);
});
test('review after spending freezes the same wallet for game, Pix and Stripe',async()=>{
  const f=fixture(),order=(await f.create()).order,r=[...f.orders.values()][0];pay(r);await f.api.handle(f.account,{action:'status',orderId:order.id});
  await q('INSERT INTO pwu_diamond_operations(operation_id,source_account,amount,reason) VALUES(?,?,100,\'shop\')',[randomUUID(),f.account]);
  await ledger.flagPayment('review_late',r.transactions.payments[0].id,'payment_review');
  await assert.rejects(q('INSERT INTO pwu_diamond_operations(operation_id,source_account,target_account,amount,reason) VALUES(?,?,99,1,\'transfer\')',[randomUUID(),f.account]),/wallet-payment-review/);
  for(const provider of ['pix','stripe']) await assert.rejects(q(`CALL pwu_${provider}_create(?,?,'custom',1000,10)`,[f.account,randomUUID()]),/account-review/);
  await assert.rejects(f.create(),/account_review/);
  const queue=await one('SELECT * FROM pwu_payment_review_queue WHERE account_id=?',[f.account]);assert.equal(Number(queue.current_balance),68);assert.equal(Number(queue.minimum_uncovered_credits),100);
  assert.equal(await balance(f.account),68); // no automatic refund, no negative wallet
});
test('Stripe review also blocks Pix and game spending',async()=>{
  const account=++accounts,request=randomUUID();let rows=await q("CALL pwu_stripe_create(?,?,'custom',1000,10)",[account,request]);const local=rows[0][0];
  await q("CALL pwu_stripe_fulfill(?,?,'cs_live_Cross','evt_Cross',1000,'brl','pi_Cross')",[local.reference,account]);
  await q("CALL pwu_stripe_flag('evt_Hold','pi_Cross','charge.refunded')");
  await assert.rejects(q("CALL pwu_pix_create(?,?,'custom',1000,10)",[account,randomUUID()]),/account-review/);
  await assert.rejects(q("INSERT INTO pwu_diamond_operations(operation_id,source_account,amount,reason) VALUES(?,?,1,'shop')",[randomUUID(),account]),/wallet-payment-review/);
});
test('confirmed expiration clears the active session without credit and allows a fresh order',async()=>{
  const f=fixture(),first=(await f.create()).order,r=[...f.orders.values()][0];
  r.status='expired';r.status_detail='expired';Object.assign(r.transactions.payments[0],{status:'expired',status_detail:'expired'});
  const result=await f.api.handle(f.account,{action:'status',orderId:first.id});
  assert.equal(result.order.status,'expired');assert(!result.order.qrCode);assert.equal(await balance(f.account),0);
  assert.notEqual((await f.create()).order.id,first.id);assert.equal(f.counts().creates,2);
});

test('conflicting cancellation data cannot unlock a second payable order',async()=>{
  for(const inconsistent of [r=>r.transactions.payments[0].status='processed',r=>r.total_paid_amount='150.00',r=>r.transactions.payments[0].paid_amount='150.00']) {
    const f=fixture(),first=(await f.create()).order,r=[...f.orders.values()][0];
    r.status='canceled';r.status_detail='canceled_transaction';r.transactions.payments[0].status='canceled';inconsistent(r);
    // Cancel intent hides the QR, but only consistent provider evidence ends the session.
    const result=await f.api.handle(f.account,{action:'cancel',orderId:first.id});
    assert.equal(result.order.status,'pending');assert(!result.order.qrCode);
    assert.equal((await f.create()).order.id,first.id);assert.equal(f.counts().creates,1);assert.equal(await balance(f.account),0);
  }
});

test('provider outage preserves cancel intent until a restarted service reconciles it',async()=>{
  const f=fixture(),order=(await f.create()).order;f.setMode('fetch-down');
  await assert.rejects(f.api.handle(f.account,{action:'cancel',orderId:order.id}),/provider-down/);
  assert.equal(Number((await store.read(f.account,order.id)).cancel_requested),1);
  f.setMode('normal');const restarted=new GamePixService({...f.api,store:new GamePixStore(cipher)});
  assert.equal((await restarted.handle(f.account,{action:'recover'})).order.status,'cancelled');
  assert.equal(f.counts().creates,1);assert.equal(await balance(f.account),0);
});

test('a timed-out worker cannot overwrite or release a newer lease',async()=>{
  const f=fixture(),order=(await f.create()).order,old=await store.lease(f.account,order.id);
  assert(old);assert.equal(await store.lease(f.account,order.id),null);
  await q('UPDATE pwu_game_pix_sessions SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE reference=?',[order.id]);
  const fresh=await store.lease(f.account,order.id);assert(fresh && fresh!==old);
  await assert.rejects(store.update(f.account,order.id,old,'cancelled'),/lease-lost/);
  await store.release(f.account,order.id,old);assert.equal((await store.read(f.account,order.id)).lease_id,fresh);
  await store.release(f.account,order.id,fresh);assert.equal((await store.read(f.account,order.id)).state,'pending');
});

test('replaying a cancelled create request cannot generate another charge',async()=>{
  const f=fixture(),request=randomUUID(),first=(await f.create(request)).order;
  await f.api.handle(f.account,{action:'cancel',orderId:first.id});
  for(let i=0;i<20;i++) assert.equal((await f.create(request)).order.status,'cancelled');
  assert.equal(f.counts().creates,1);assert.equal(await balance(f.account),0);
  assert.notEqual((await f.create()).order.id,first.id);
});

test('invalid provider QR payloads never leak into the client or create extra orders',async()=>{
  const f=fixture(),first=(await f.create()).order,r=[...f.orders.values()][0];
  const valid=r.transactions.payments[0].payment_method.qr_code;
  for(const bad of ['',null,{},'x'.repeat(4097),'PWU INVALID CONTROL '+String.fromCharCode(0)]) {
    r.transactions.payments[0].payment_method.qr_code=bad;
    await assert.rejects(f.api.handle(f.account,{action:'status',orderId:first.id}),/provider-pending/);
    assert.equal((await store.active(f.account)).reference,first.id);assert.equal(await balance(f.account),0);
  }
  r.transactions.payments[0].payment_method.qr_code=valid;
  assert.equal((await f.api.handle(f.account,{action:'recover'})).order.qrCode,valid);assert.equal(f.counts().creates,1);
});

test('replaying a paid request while a new order exists cannot double-credit or replace the active order',async()=>{
  const f=fixture(),request=randomUUID(),first=(await f.create(request)).order,r=[...f.orders.values()][0];pay(r);
  await f.api.handle(f.account,{action:'status',orderId:first.id});const second=(await f.create()).order;
  for(let i=0;i<10;i++) assert.equal((await f.create(request)).order.id,first.id);
  assert.equal((await store.active(f.account)).reference,second.id);assert.equal(await balance(f.account),168);
  assert.equal(Number((await one('SELECT COUNT(*) AS n FROM pwu_diamond_operations WHERE target_account=?',[f.account])).n),1);
});

test('private HTTP listener rejects missing auth, oversized input and malformed JSON',async()=>{
  let calls=0;const token='a'.repeat(64),server=createGameBridge({token,service:{async handle(){calls++;return {ok:true};}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  function request(body,auth='Bearer '+token) {return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/game-pix',method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(body);});}
  try {assert.equal(await request('{}',''),401);assert.equal(await request('{broken'),503);assert.equal(await request('x'.repeat(3000)),413);assert.equal(await request('{"account":1,"request":{"action":"recover"},"coins":100}'),400);assert.equal(await request('{"account":1,"request":{"action":"recover"}}'),200);assert.equal(calls,1);} finally {await new Promise(resolve=>server.close(resolve));}
});
