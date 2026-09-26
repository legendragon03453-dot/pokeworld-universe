import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createApp} from '../runtime/server.mjs';
import * as validation from '../site/api/_lib/pix-validation.js';
import * as signatures from '../site/api/_lib/pix-signature.js';
import * as catalog from '../site/api/_lib/packages.js';
import * as coupons from '../site/api/_lib/coupons.js';
const reference='12345678-1234-1234-1234-123456789012';
const id='ORD'+'A'.repeat(26),paymentId='PAY'+'B'.repeat(26);
const local={reference,account_id:42,package_id:'custom',amount_cents:1000,credits:10};
const env={MP_MODE:'live',MP_USER_ID:'12345',MP_APPLICATION_ID:'67890',MP_WEBHOOK_SECRET:'fixture-only-secret'};
const options={userId:env.MP_USER_ID,applicationId:env.MP_APPLICATION_ID};
const remote={id,type:'online',processing_mode:'automatic',user_id:'12345',integration_data:{application_id:'67890'},country_code:'BRA',currency:'BRL',external_reference:reference,total_amount:'10.00',total_paid_amount:'10.00',status:'processed',status_detail:'accredited',transactions:{payments:[{id:paymentId,amount:'10.00',status:'processed',status_detail:'accredited',payment_method:{id:'pix',type:'bank_transfer',ticket_url:'https://www.mercadopago.com.br/payments/123/ticket?hash=fixture'}}]}};
const input={packageId:'custom',amount:10,requestId:reference,cpf:'11144477735'}; // Synthetic CPF fixture.
remote.transactions.payments[0].paid_amount='10.00';
const clone=()=>structuredClone(remote);
function response(){return {code:200,status(c){this.code=c;return this;},json(v){this.value=v;return this;},end(){return this;}};}
async function module(name,mocks){
 const context=vm.createContext({Buffer,URL,console:{log(){},error(){}},process:{env}});
 const m=new vm.SourceTextModule(await readFile(new URL('../site/api/'+name,import.meta.url),'utf8'),{context});
 await m.link(spec=>{const values=mocks[spec];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 await m.evaluate();return m.namespace.default;
}
test('Pix verifies canonical amount, currency, merchant, app, account binding and exact payment method',()=>{
 assert.equal(validation.validatePixOrder(remote,local,{...options,paid:true}),remote);
 for(const patch of [{id:'ORDTST'+'A'.repeat(26)},{currency:'USD'},{country_code:'ARG'},{user_id:'999'},{integration_data:{application_id:'999'}},{type:'offline'},{processing_mode:'manual'},{external_reference:'wrong'},{total_amount:'0.10'},{total_paid_amount:'0.10'},{status:'action_required'},{status_detail:'refunded'},{transactions:{payments:[]}}])
  assert.throws(()=>validation.validatePixOrder({...remote,...patch},local,{...options,paid:true}));
 for(const change of [{amount:'0.10'},{paid_amount:'0.10'},{paid_amount:undefined},{status:'action_required'},{status_detail:'refunded'},{payment_method:{id:'visa',type:'credit_card'}}]) {
  const r=clone();Object.assign(r.transactions.payments[0],change);assert.throws(()=>validation.validatePixOrder(r,local,{...options,paid:true}));
 }
 assert.throws(()=>validation.validatePixOrder(remote,{...local,provider_order_id:'ORD'+'C'.repeat(26)},options));
 assert.throws(()=>validation.validatePixOrder(remote,{...local,payment_id:'PAY'+'C'.repeat(26)},options));
 const two=clone();two.transactions.payments.push(two.transactions.payments[0]);assert.throws(()=>validation.validatePixOrder(two,local,options));
});
test('only official live Pix ticket URL redirects and input cannot set recipient, price, credits or provider',()=>{
 assert.equal(validation.pixTicketUrl(remote.transactions.payments[0].payment_method.ticket_url),remote.transactions.payments[0].payment_method.ticket_url);
 for(const url of ['https://www.mercadopago.com.br/sandbox/payments/123/ticket','http://www.mercadopago.com.br/payments/123/ticket','https://www.mercadopago.com.br.evil.invalid/payments/123/ticket','https://user@www.mercadopago.com.br/payments/123/ticket','https://www.mercadopago.com.br/redirect','javascript:alert(1)'])assert.throws(()=>validation.pixTicketUrl(url));
 for(const key of ['account','account_id','credits','price','email','payer','provider','url'])assert.throws(()=>validation.checkoutInput({...input,[key]:'bad'}));
});

test('CPF is required, normalizes punctuation and rejects malformed values and both check-digit errors',()=>{
 assert.equal(validation.checkoutInput({...input,cpf:'111.444.777-35'}).cpf,input.cpf);
 for(const cpf of [undefined,null,11144477735,'','1114447773','111444777350','00000000000','11111111111','11144477725','11144477734','x11144477735','111.444.777/35',{},[]])
  assert.throws(()=>validation.checkoutInput({...input,cpf}));
});

test('provider receives validated CPF in payer identification only, with unchanged amount and idempotency',async()=>{
 const calls=[];
 const context=vm.createContext({AbortSignal,process:{env:{...env,MP_MODE:'live',MP_ACCESS_TOKEN:'APP_USR-fixture-only'}},fetch:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/users/me')?{id:12345,country_id:'BR',tags:[]}:remote};
 }});
 const source=await readFile(new URL('../site/api/_lib/pix-mercadopago.js',import.meta.url),'utf8');
 const m=new vm.SourceTextModule(source,{context});
 await m.link(()=>new vm.SyntheticModule(['ORDER_ID','normalizeCpf'],function(){this.setExport('ORDER_ID',validation.ORDER_ID);this.setExport('normalizeCpf',validation.normalizeCpf);},{context}));
 await m.evaluate();
 await assert.rejects(()=>m.namespace.createPixOrder(local,'fixture@example.invalid','11111111111'));assert.equal(calls.length,0);
 await m.namespace.createPixOrder(local,'fixture@example.invalid','111.444.777-35');
 const outbound=calls[1];assert.equal(outbound.url,'https://api.mercadopago.com/v1/orders');
 assert.deepEqual(JSON.parse(outbound.options.body).payer,{email:'fixture@example.invalid',identification:{type:'CPF',number:input.cpf}});
 assert.equal(JSON.parse(outbound.options.body).total_amount,'10.00');assert.equal(outbound.options.headers['X-Idempotency-Key'],reference);
 assert.equal(outbound.options.redirect,'error');
});
test('webhook HMAC authenticates ID/request/timestamp and rejects replay and ambiguous headers',()=>{
 const now=Date.now(),requestId='request-fixture';
 for(const ts of [String(now),String(Math.floor(now/1000))]) {
  const hash=crypto.createHmac('sha256',env.MP_WEBHOOK_SECRET).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  const args={xSignature:`ts=${ts},v1=${hash}`,xRequestId:requestId,dataId:id,secret:env.MP_WEBHOOK_SECRET,now};
  assert.equal(signatures.assinaturaValida(args),true);
  for(const patch of [{dataId:'ORD'+'C'.repeat(26)},{xRequestId:'other'},{secret:'wrong'},{now:now+301000},{xSignature:args.xSignature+',ts='+ts},{xSignature:args.xSignature+',v1='+hash}])assert.equal(signatures.assinaturaValida({...args,...patch}),false);
 }
});
test('checkout snapshots authenticated account, rejects forgery and retries same saved reference after provider timeout',async()=>{
 let account=42,saved,created=[],bound=[],timeout=true; const result={...remote,status:'action_required',status_detail:'waiting_transfer'};
 const handler=await module('pix-checkout.js',{
  './_lib/pix-mercadopago.js':{pixConfigured:()=>true,createPixOrder:async(l,email,cpf)=>{created.push([l.reference,email,cpf]);if(timeout)throw new Error('timeout');return result;},fetchPixOrder:async()=>result},
  './_lib/pix-validation.js':validation,'./_lib/packages.js':catalog,'./_lib/coupons.js':coupons,
  './_lib/pix-orders.js':{createOrder:async(...args)=>{saved=args;return local;},bindOrder:async(...args)=>bound.push(args)},
  './_lib/gamedb.js':{gameConfigured:()=>true,one:async()=>({id:42,email:'fixture@example.invalid'})},
  './_lib/session.js':{accountFromRequest:async()=>account},'./_lib/email-auth.js':{limitAuth:async()=>{}}
 });
 const run=async body=>{const r=response();await handler({method:'POST',body},r);return r;};
 assert.equal((await run(input)).code,503);timeout=false;assert.equal((await run(input)).code,200);
 assert.deepEqual(created,[[reference,'fixture@example.invalid',input.cpf],[reference,'fixture@example.invalid',input.cpf]]);
 assert.deepEqual(saved,[42,reference,'custom',1000,10]);assert.deepEqual(bound,[[42,reference,id]]);
 saved=null;assert.equal((await run({...input,account_id:99})).code,400);assert.equal(saved,null);
 const attempts=created.length;
 for(const cpf of [undefined,'11111111111','11144477734']) {
  assert.equal((await run({...input,cpf})).code,400);assert.equal(saved,null);assert.equal(created.length,attempts);
 }
 account=null;assert.equal((await run(input)).code,401);
});
test('webhook re-fetches authoritative order; pending, invalid signature, test mode and mismatches never credit',async()=>{
 let signed=true,current=clone(),credits=0,fetches=0,flagged=0,failing=false;
 const handler=await module('webhook/pix-live.js',{
  '../_lib/pix-signature.js':{assinaturaValida:()=>signed},
  '../_lib/pix-mercadopago.js':{pixConfigured:()=>true,fetchPixOrder:async()=>{fetches++;return current;}},
  '../_lib/pix-validation.js':validation,
  '../_lib/pix-orders.js':{readOrder:async()=>local,bindOrder:async()=>{},flagPayment:async()=>flagged++,fulfillOrder:async()=>{if(failing)throw new Error('db-unavailable');credits++;return {credited:1};}}
 });
 const event={type:'order',live_mode:true,user_id:env.MP_USER_ID,application_id:env.MP_APPLICATION_ID,data:{id}};
 const run=async(patch={})=>{const r=response();await handler({method:'POST',query:{'data.id':id},headers:{'x-request-id':'request-fixture'},body:{...event,...patch}},r);return r.code;};
 signed=false;assert.equal(await run(),401);assert.equal(fetches,0);signed=true;
 assert.equal(await run({live_mode:false}),400);assert.equal(await run({user_id:'999'}),400);assert.equal(fetches,0);
 current.total_amount='0.01';assert.equal(await run(),500);assert.equal(credits,0);
 current=clone();current.status='action_required';current.status_detail='waiting_transfer';assert.equal(await run(),200);assert.equal(credits,0);
 current=clone();current.status_detail='refunded';assert.equal(await run(),200);assert.equal(flagged,1);assert.equal(credits,0);
 current=clone();failing=true;assert.equal(await run(),500);failing=false;
 assert.equal(await run(),200);assert.equal(credits,1);
});
async function serve(t,options){const app=createApp(options);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));return 'http://127.0.0.1:'+app.address().port;}
test('Pix flags isolate checkout, webhook, legacy routes and unrelated game APIs',async t=>{
 let last;const loadHandler=async name=>async(req,res)=>{last=name;res.status(200).end();};
 const base=await serve(t,{rankingPreview:true,pixWebhookEnabled:true,loadHandler});
 assert.equal((await fetch(base+'/api/webhook/mercadopago',{method:'POST'})).status,200);assert.equal(last,'webhook/pix-live.js');
 for(const path of ['/api/checkout','/api/stripe-checkout','/api/admin-login','/api/game?resource=snapshot'])assert.equal((await fetch(base+path,{method:'POST'})).status,503);
 const enabled=await serve(t,{rankingPreview:true,pixEnabled:true,loadHandler});
 assert.equal((await fetch(enabled+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,200);assert.equal(last,'pix-checkout.js');
 assert.equal((await fetch(enabled+'/api/checkout',{method:'POST',headers:{origin:'https://evil.invalid'}})).status,403);
 assert.equal((await fetch(enabled+'/api/webhook/mercadopago?data.id=a&data.id=b',{method:'POST'})).status,400);
});
