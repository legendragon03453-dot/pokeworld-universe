import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createApp} from '../runtime/server.mjs';
import * as validation from '../site/api/_lib/stripe-live-validation.js';
import * as stripe from '../site/api/_lib/stripe.js';
import * as catalog from '../site/api/_lib/packages.js';
import * as coupons from '../site/api/_lib/coupons.js';
const reference='12345678-1234-1234-1234-123456789012';
const order={reference,account_id:42,package_id:'custom',amount_cents:1000,credits:10,session_id:null};
const session={id:'cs_live_Verify',livemode:true,status:'complete',mode:'payment',payment_status:'paid',currency:'brl',amount_total:1000,amount_subtotal:1000,payment_intent:'pi_Verify',payment_method_types:['card'],client_reference_id:reference,metadata:{integration:validation.APP,reference,account_id:'42',package_id:'custom'}};
const input={packageId:'custom',amount:10,requestId:reference};
const intent={id:'pi_Verify',object:'payment_intent',livemode:true,status:'succeeded',currency:'brl',amount:1000,amount_received:1000,metadata:{integration:validation.APP,reference},latest_charge:{id:'ch_Verify',object:'charge',livemode:true,payment_intent:'pi_Verify',status:'succeeded',paid:true,captured:true,currency:'brl',amount:1000,amount_captured:1000,amount_refunded:0,refunded:false,disputed:false,payment_method_details:{type:'card'},refunds:{data:[],has_more:false}}};
async function module(name,mocks,env={STRIPE_MODE:'live'}) {
 const context=vm.createContext({Buffer,URL,console:{log(){},error(){}},process:{env}});
 const m=new vm.SourceTextModule(await readFile(new URL('../site/api/'+name,import.meta.url),'utf8'),{context});
 await m.link(spec=>{const values=mocks[spec];assert.ok(values,spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 await m.evaluate();return m.namespace.default;
}
function response(){return {code:200,status(c){this.code=c;return this;},json(v){this.value=v;return this;},end(){return this;}};}
test('browser-controlled account, coins, prices, payment method and return URLs are rejected',()=>{
 assert.deepEqual(validation.checkoutInput(input),input);
 for(const [key,value]of Object.entries({account_id:99,userId:99,coins:999999,price:1,currency:'usd',provider:'stone',success_url:'https://evil.invalid',payment_method_types:['pix']}))
  assert.throws(()=>validation.checkoutInput({...input,[key]:value}),key);
 for(const amount of [-1,0,1,20001,'1e3','10.001',true,[],{},null,'Infinity'])assert.throws(()=>validation.checkoutInput({...input,amount}));
 assert.throws(()=>validation.checkoutInput({...input,requestId:['1234']}));
 assert.throws(()=>validation.checkoutInput({...input,packageId:'plus'}));
});
test('paid session must match the exact account, amount, reference, provider and environment',()=>{
 assert.equal(validation.validateLiveSession(session,order,{paid:true}),session);
 for(const change of [{livemode:false},{id:'cs_test_Verify'},{amount_total:1},{amount_subtotal:1},{currency:'usd'},{payment_status:'unpaid'},{status:'open'},{mode:'subscription'},{payment_method_types:['card','pix']},{payment_intent:null},{client_reference_id:'wrong'},{metadata:{...session.metadata,account_id:'99'}},{metadata:{...session.metadata,integration:'other'}}])
  assert.throws(()=>validation.validateLiveSession({...session,...change},order,{paid:true}));
 assert.throws(()=>validation.validateLiveSession(session,{...order,session_id:'cs_live_Other'},{paid:true}));
});
test('redirect accepts only Stripe hosted checkout',()=>{
 assert.equal(validation.checkoutUrl('https://checkout.stripe.com/c/pay/x'),'https://checkout.stripe.com/c/pay/x');
 for(const url of ['javascript:alert(1)','https://checkout.stripe.com.evil.invalid','http://checkout.stripe.com','https://user@checkout.stripe.com','https://checkout.stripe.com:444/x'])assert.throws(()=>validation.checkoutUrl(url));
});
test('webhook signature checks raw body, timestamp and every supplied signature',()=>{
 const now=Date.now(), t=String(Math.floor(now/1000)), raw='{ "sample": 1 }', secret='whsec_fixturesOnly';
 const sign=val=>crypto.createHmac('sha256',secret).update(`${t}.${val}`).digest('hex');
 const header=`t=${t},v1=invalid,v1=${sign(raw)}`;
 assert.equal(stripe.assinaturaStripeValida({header,rawBody:raw,secret,now}),true);
 assert.equal(stripe.assinaturaStripeValida({header,rawBody:JSON.stringify(JSON.parse(raw)),secret,now}),false);
 assert.equal(stripe.assinaturaStripeValida({header,rawBody:raw,secret,now:now+301000}),false);
 assert.equal(stripe.assinaturaStripeValida({header,rawBody:raw,secret:'whsec_wrong',now}),false);
});
test('checkout derives recipient from authentication and fixes amount, card and 3DS on server',async()=>{
 let saved,form,recipient=42,limited=false;
 const handler=await module('stripe-live-checkout.js',{
  './_lib/stripe.js':{stripeConfigured:()=>true,stripeCall:async(path,f)=>{form=f;return {...session,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/fixture'};}},
  './_lib/packages.js':catalog,'./_lib/coupons.js':coupons,
  './_lib/stripe-orders.js':{createOrder:async(...args)=>{saved=args;return {...order};},bindOrder:async()=>{}},
  './_lib/gamedb.js':{gameConfigured:()=>true,one:async()=>({id:42,email:'fixture@example.invalid'})},
  './_lib/session.js':{accountFromRequest:async()=>recipient},
  './_lib/email-auth.js':{limitAuth:async()=>{if(limited)throw Object.assign(new Error('slow down'),{authPublic:true,status:429});}},
  './_lib/stripe-live-validation.js':validation
 });
 const req=body=>({method:'POST',body,headers:{}});
 let res=response();await handler(req(input),res);assert.equal(res.code,200);assert.deepEqual(saved,[42,reference,'custom',1000,10]);
 assert.equal(form['payment_method_types[0]'],'card');assert.equal(form['payment_method_options[card][request_three_d_secure]'],'any');
 assert.equal(form['line_items[0][price_data][unit_amount]'],'1000');assert.match(form.success_url,/^https:\/\/pokeworlduniverse.com\//);
 saved=null;res=response();await handler(req({...input,coins:100000}),res);assert.equal(res.code,400);assert.equal(saved,null);
 recipient=null;res=response();await handler(req(input),res);assert.equal(res.code,401);
 recipient=42;limited=true;res=response();await handler(req(input),res);assert.equal(res.code,429);assert.equal(saved,null);
});
test('signed webhook independently retrieves Stripe and refuses mismatches before DB credit',async()=>{
 let signature=true, calls=0,credits=0,retrieved={...session},failDatabase=false;
 const event={id:'evt_Fixture',livemode:true,type:'checkout.session.completed',data:{object:session}};
 let raw=JSON.stringify(event);
 const handler=await module('webhook/stripe-live.js',{
  '../_lib/stripe.js':{rawBody:async()=>raw,assinaturaStripeValida:()=>signature,stripeCall:async path=>{calls++;return path.startsWith('/payment_intents/')?intent:retrieved;}},
  '../_lib/stripe-live-validation.js':validation,
  '../_lib/stripe-orders.js':{readOrder:async()=>order,flagPayment:async()=>{},fulfillOrder:async()=>{if(failDatabase)throw new Error('timeout');credits++;return {credited:1};}}
 });
 const request=async()=>{const res=response();await handler({method:'POST',headers:{}},res);return res.code;};
 signature=false;assert.equal(await request(),401);assert.equal(calls,0);assert.equal(credits,0);
 signature=true;raw=JSON.stringify({...event,livemode:false});assert.equal(await request(),400);assert.equal(calls,0);
 raw=JSON.stringify(event);retrieved={...session,amount_total:1};assert.equal(await request(),500);assert.equal(credits,0);
 retrieved={...session,payment_status:'unpaid'};assert.equal(await request(),200);assert.equal(credits,0);
 retrieved={...session};failDatabase=true;assert.equal(await request(),500);assert.equal(credits,0);
 failDatabase=false;assert.equal(await request(),200);assert.equal(credits,1);
 raw=JSON.stringify({...event,data:{object:{...session,metadata:{integration:'unrelated'}}}});const before=calls;assert.equal(await request(),200);assert.equal(calls,before);
});
async function serve(t,options){const app=createApp(options);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));return 'http://127.0.0.1:'+app.address().port;}
test('server isolates Stripe from legacy gateways, admin and unrelated game APIs',async t=>{
 let last;
 const base=await serve(t,{stripeEnabled:true,rankingPreview:true,emailAuthEnabled:true,loadHandler:async name=>async(req,res)=>{last={name,ip:req.headers['x-forwarded-for']};res.status(200).json({ok:true});}});
 for(const path of ['/api/checkout','/api/webhook/mercadopago','/api/admin-login','/api/game?resource=snapshot'])assert.equal((await fetch(base+path)).status,503);
 assert.equal((await fetch(base+'/api/stripe-checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/stripe-checkout',{method:'POST',headers:{'content-type':'application/json'},body:'[]'})).status,400);
 assert.equal((await fetch(base+'/api/stripe-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({large:'x'.repeat(17000)})})).status,413);
 assert.equal((await fetch(base+'/api/stripe-checkout',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'192.0.2.1','x-forwarded-for':'attacker'},body:'{}'})).status,200);
 assert.equal(last.ip,'192.0.2.1');assert.equal(last.name,'stripe-live-checkout.js');
 for(const path of ['/api/_lib/session.js','/.env','/package.json','/runtime/server.mjs','/api/stripe-live-checkout.js'])assert.equal((await fetch(base+path)).status,404);
});
test('webhook stays enabled while new checkouts pause; exact signed bytes reach handler',async t=>{
 const raw='{ "a": 1 }\n';
 const base=await serve(t,{stripeWebhookEnabled:true,rankingPreview:true,loadHandler:async name=>async(req,res)=>{assert.equal(name,'webhook/stripe-live.js');let content='';for await(const b of req)content+=b;assert.equal(content,raw);res.status(200).end();}});
 assert.equal((await fetch(base+'/api/stripe-checkout',{method:'POST'})).status,503);
 assert.equal((await fetch(base+'/api/webhook/stripe',{method:'POST',body:raw})).status,200);
});
test('HTML uses fresh script nonces, no framing and no caching; public source remains viewable',async t=>{
 const base=await serve(t,{});
 const a=await fetch(base+'/login.html'),b=await fetch(base+'/login.html');
 assert.equal(a.status,200);assert.equal(a.headers.get('x-frame-options'),'DENY');assert.equal(a.headers.get('cache-control'),'no-store');
 assert.notEqual(a.headers.get('content-security-policy'),b.headers.get('content-security-policy'));
 const html=await a.text();assert.match(html,/<script nonce="[A-Za-z0-9+/=]+"/);assert.match(a.headers.get('content-security-policy'),/strict-dynamic/);
 assert.equal((await fetch(base+'/pages.js')).status,200);
});
