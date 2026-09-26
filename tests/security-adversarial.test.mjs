import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import * as validation from '../site/api/_lib/stripe-live-validation.js';
import * as stripe from '../site/api/_lib/stripe.js';
import * as pix from '../site/api/_lib/pix-validation.js';
import * as signatures from '../site/api/_lib/pix-signature.js';
import {createApp} from '../runtime/server.mjs';
const ref='12345678-1234-1234-1234-123456789012';
const order={reference:ref,account_id:42,package_id:'custom',amount_cents:1000,credits:10};
const session={id:'cs_live_Security',livemode:true,status:'complete',mode:'payment',payment_status:'paid',currency:'brl',amount_total:1000,amount_subtotal:1000,payment_intent:'pi_Security',payment_method_types:['card'],client_reference_id:ref,metadata:{integration:validation.APP,reference:ref,account_id:'42',package_id:'custom'}};
function charge(){return {id:'ch_Security',object:'charge',livemode:true,payment_intent:'pi_Security',currency:'brl',amount:1000,amount_captured:1000,amount_refunded:0,paid:true,captured:true,status:'succeeded',refunded:false,disputed:false,payment_method_details:{type:'card'},refunds:{data:[],has_more:false}};}
function intent(){return {id:'pi_Security',object:'payment_intent',livemode:true,status:'succeeded',currency:'brl',amount:1000,amount_received:1000,metadata:{integration:validation.APP,reference:ref},latest_charge:charge()};}
const secret='whsec_OfflineSecurityFixturesOnly';
const response=()=>({code:200,status(v){this.code=v;return this;},json(v){this.body=v;return this;},end(){return this;}});
async function load(name,mocks,env={STRIPE_MODE:'live',STRIPE_WEBHOOK_SECRET:secret}) {
 const context=vm.createContext({Buffer,URL,Date,console:{log(){},error(){}},process:{env}});
 const m=new vm.SourceTextModule(await readFile(new URL('../site/api/'+name,import.meta.url),'utf8'),{context});
 await m.link(spec=>{const v=mocks[spec];assert.ok(v,spec);return new vm.SyntheticModule(Object.keys(v),function(){for(const[k,value]of Object.entries(v))this.setExport(k,value);},{context});});
 await m.evaluate();return m.namespace;
}
async function stripeHarness(current=intent()) {
 let credits=0,fetches=0,fail=false;
 const handler=(await load('webhook/stripe-live.js',{
  '../_lib/stripe.js':{...stripe,stripeCall:async path=>{fetches++;if(fail)throw new Error('provider unavailable');return path.startsWith('/payment_intents/')?current:session;}},
  '../_lib/stripe-live-validation.js':validation,
  '../_lib/stripe-orders.js':{readOrder:async()=>order,flagPayment:async()=>{},fulfillOrder:async()=>{credits++;return {credited:1};}}
 })).default;
 return {get credits(){return credits;},get fetches(){return fetches;},set fail(v){fail=v;},async run({header,raw,event}={}){
  const body=raw??JSON.stringify(event??{id:'evt_Security',livemode:true,type:'checkout.session.completed',data:{object:session}});
  const t=Math.floor(Date.now()/1000);const mac=crypto.createHmac('sha256',secret).update(`${t}.${body}`).digest('hex');
  const req=Readable.from([Buffer.from(body)]);req.method='POST';req.headers={'stripe-signature':header??`t=${t},v1=${mac}`};
  const res=response();await handler(req,res);return res.code;
 }};
}
test('real HMAC rejects 300 fabricated signatures before provider or database calls',async()=>{
 const h=await stripeHarness();
 for(let i=0;i<300;i++)assert.equal(await h.run({header:`t=${Math.floor(Date.now()/1000)},v1=${crypto.createHash('sha256').update('forged'+i).digest('hex')}`}),401);
 assert.equal(h.credits,0);assert.equal(h.fetches,0);
});
test('authenticated successful current charge grants credit; provider errors fail closed',async()=>{
 const h=await stripeHarness();h.fail=true;assert.equal(await h.run(),500);assert.equal(h.credits,0);
 h.fail=false;assert.equal(await h.run(),200);assert.equal(h.credits,1);
});
for(const [label,patch] of [
 ['full refund before delayed completion',x=>{x.latest_charge.refunded=true;x.latest_charge.amount_refunded=1000;}],
 ['partial refund',x=>{x.latest_charge.amount_refunded=1;}],
 ['pending refund',x=>{x.latest_charge.refunds.data=[{id:'re_Fixture',status:'pending'}];}],
 ['open dispute',x=>{x.latest_charge.disputed=true;}],
 ['uncaptured charge',x=>{x.latest_charge.captured=false;x.latest_charge.amount_captured=0;}],
 ['wrong intent/charge linkage',x=>{x.latest_charge.payment_intent='pi_Another';}],
 ['wrong received amount',x=>{x.amount_received=999;}],
 ['wrong charge currency',x=>{x.latest_charge.currency='usd';}],
 ['test charge with live session',x=>{x.latest_charge.livemode=false;}],
 ['missing expanded charge',x=>{x.latest_charge='ch_Security';}],
 ['different reference in payment intent',x=>{x.metadata.reference='another-order';}],
 ['non-card charge',x=>{x.latest_charge.payment_method_details.type='pix';}]
])test('no credit for '+label,async()=>{
 const current=intent();patch(current);const h=await stripeHarness(current);
 await h.run();assert.equal(h.credits,0,label);
});
test('signed malformed JSON shapes do not crash the webhook',async()=>{
 for(const raw of ['null','[]','0','"text"','{}','{"data":null}','{']){
  const h=await stripeHarness();const status=await h.run({raw});assert.ok([200,400].includes(status));assert.equal(h.credits,0);
 }
});
test('raw webhook preserves Unicode bytes split inside multibyte characters',async()=>{
 const original=Buffer.from('{"description":"Pokémon • doação"}');
 assert.equal(await stripe.rawBody(Readable.from([...original].map(b=>Buffer.from([b])))),original.toString('utf8'));
});
test('strict checkout rejects 5000 hostile values, unknown fields and prototype keys',()=>{
 const input={packageId:'custom',amount:10,requestId:ref};
 const invalid=[null,true,false,[],{},NaN,Infinity,-Infinity,-1,0,'1e2','0x64','10,00','10.001','100\u0000','100;DROP TABLE accounts','20000.01'];
 for(let i=0;i<5000;i++){
  const body=i%2?{...input,amount:invalid[i%invalid.length]}:{...input,['forged_'+i]:i};
  assert.throws(()=>validation.checkoutInput(body));
  assert.throws(()=>pix.checkoutInput({...body,cpf:'52998224725'}));
 }
 for(const key of ['__proto__','constructor','prototype','account_id','credits','paid','status','price','payment_id']){
  const body=JSON.parse(JSON.stringify(input).slice(0,-1)+`,"${key}":{"credits":26000}}`);
  assert.throws(()=>validation.checkoutInput(body));
 }
});
test('session tampering, revocation, expiry and missing MFA reject unauthorized identity',async()=>{
 let epoch=null;
 const env={SESSION_SECRET:'offline-session-signing-fixture-only',PWU_EMAIL_AUTH_ENABLED:'true',PWU_TOTP_REQUIRED:'true'};
 const s=await load('_lib/session.js',{'crypto':{default:crypto},'./gamedb.js':{one:async sql=>sql.includes('epochs')?epoch:{enabled:1}}},env);
 const token=s.sign(42,Date.now(),true);assert.equal(s.verify(token),42);
 const payload=Buffer.from(JSON.stringify({a:99,exp:Date.now()+100000})).toString('base64url');
 for(const forged of [payload+'.'+token.split('.')[1],token+'.extra',token.slice(0,-4),'','null'])assert.equal(s.verify(forged),null);
 assert.equal(await s.accountFromRequest({headers:{authorization:'Bearer '+s.sign(42,Date.now(),false)}}),null);
 assert.equal(await s.accountFromRequest({headers:{authorization:'Bearer '+token}}),42);
 epoch={revoked_at:Date.now()+1};assert.equal(await s.accountFromRequest({headers:{authorization:'Bearer '+token}}),null);
 const expired=Buffer.from(JSON.stringify({a:42,exp:1})).toString('base64url');
 assert.equal(s.verify(expired+'.'+crypto.createHmac('sha256',env.SESSION_SECRET).update(expired).digest('base64url')),null);
});
test('Pix real HMAC rejects ID substitution, old signatures and invalid secrets over 500 samples',()=>{
 const now=Date.now(),id='ORD'+'A'.repeat(26),rid='offline-request',ts=String(now),secret='synthetic-only';
 const hash=crypto.createHmac('sha256',secret).update(`id:${id.toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');
 const args={xSignature:`ts=${ts},v1=${hash}`,xRequestId:rid,dataId:id,secret,now};
 assert.equal(signatures.assinaturaValida(args),true);
 for(let i=0;i<500;i++)assert.equal(signatures.assinaturaValida({...args,dataId:'ORD'+i.toString().padStart(26,'B')}),false);
 for(const patch of [{now:now+301000},{secret:'fake'},{xRequestId:'another'}])assert.equal(signatures.assinaturaValida({...args,...patch}),false);
});
test('local HTTP rejects cross-origin writes, oversize data, ambiguous queries and private files',async t=>{
 let calls=0;const app=createApp({pixEnabled:true,stripeEnabled:true,pixWebhookEnabled:true,loadHandler:async()=>async(req,res)=>{calls++;res.status(200).json({ok:true});}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));
 const base='http://127.0.0.1:'+app.address().port;
 for(const [path,options,status] of [
  ['/api/checkout',{method:'POST',headers:{origin:'https://attacker.invalid'},body:'{}'},403],
  ['/api/stripe-checkout',{method:'POST',headers:{'sec-fetch-site':'cross-site'},body:'{}'},403],
  ['/api/checkout',{method:'POST',body:'x'.repeat(20000)},413],
  ['/api/webhook/mercadopago?data.id=a&data.id=b',{method:'POST',body:'{}'},400],
  ['/api/webhook/mercadopago',{method:'POST',body:'x'.repeat(262145)},413],
  ['/.env',{},404],['/api/_lib/gamedb.js',{},404],['/package.json',{},404],['/sql/pwu-pix-production.sql',{},404]
 ])assert.equal((await fetch(base+path,options)).status,status,path);
 assert.equal(calls,0);
});
