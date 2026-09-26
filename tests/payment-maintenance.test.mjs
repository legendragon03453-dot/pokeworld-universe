import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createApp} from '../runtime/server.mjs';
import {createGamePixHandler} from '../site/api/_lib/game-pix-http.js';

test('schema maintenance and DB failures block purchases and webhooks without acknowledging payment',async()=>{
 let blocked=true,calls=0,fail=false;
 const app=createApp({pixEnabled:true,stripeEnabled:true,emailAuthEnabled:true,
  paymentMaintenance:async()=>{if(fail)throw Error('database');return blocked;},
  gamePixHandler:async(req,res)=>{calls++;res.end('{}');},
  loadHandler:async()=>async(req,res)=>{calls++;res.json({ok:true});}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;
 try {
  for(const path of ['/api/checkout','/api/stripe-checkout','/api/coupon','/api/webhook/mercadopago','/api/webhook/stripe','/api/game-pix']) {
   const res=await fetch(base+path,{method:'POST'});assert.equal(res.status,503);assert.equal(res.headers.get('retry-after'),'30');
  }
  assert.equal(calls,0);assert.equal((await fetch(base+'/healthz')).status,200);
  assert.equal((await fetch(base+'/api/account')).status,200);assert.equal(calls,1);
  blocked=false;assert.equal((await fetch(base+'/api/game-pix',{method:'POST'})).status,200);assert.equal(calls,2);
  fail=true;assert.equal((await fetch(base+'/api/game-pix',{method:'POST'})).status,503);assert.equal(calls,2);
 } finally {await new Promise(resolve=>app.close(resolve));}
});

function request(ip='127.0.0.1') {
 const req=Readable.from([Buffer.from('{"action":"recover"}')]);
 Object.assign(req,{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(64),'content-type':'application/json','x-forwarded-for':ip},socket:{remoteAddress:ip}});
 const res={statusCode:0,setHeader(){},end(text){this.body=JSON.parse(text);}};
 return {req,res};
}
test('invalid-ticket flooding stops before further database or payment calls',async()=>{
 let queries=0,calls=0;
 const handler=createGamePixHandler({consume:async()=>{queries++;return null;},service:{handle(){calls++;}}});
 for(let n=0;n<125;n++) {const {req,res}=request();await handler(req,res);assert.equal(res.statusCode,n<120?401:429);}
 assert.equal(queries,120);assert.equal(calls,0);
 const {req,res}=request('127.0.0.2');await handler(req,res);assert.equal(res.statusCode,401);assert.equal(queries,121);
});
test('in-flight requests are bounded and slots recover after dependency failure',async()=>{
 const pending=[];let queries=0;
 const handler=createGamePixHandler({consume:()=>{queries++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));},service:{async handle(){return {ok:true};}}});
 const requests=Array.from({length:64},()=>request());const promises=requests.map(({req,res})=>handler(req,res));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(queries,64);
 const limited=request();await handler(limited.req,limited.res);assert.equal(limited.res.statusCode,429);assert.equal(queries,64);
 pending.forEach(p=>p.reject(Error('database offline')));await Promise.all(promises);assert(requests.every(x=>x.res.statusCode===503));
 const recovered=request();const done=handler(recovered.req,recovered.res);await new Promise(resolve=>setImmediate(resolve));pending.at(-1).resolve(1);await done;
 assert.equal(recovered.res.statusCode,200);
});
