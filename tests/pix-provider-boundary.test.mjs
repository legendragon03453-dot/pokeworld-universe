import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as validation from '../site/api/_lib/pix-validation.js';
const id='ORD'+'A'.repeat(26),key='12345678-1234-1234-1234-123456789012-cancel';
async function adapter({merchant={id:123,country_id:'BR',tags:[]},failure=false,envPatch={}}={}) {
  const calls=[],env={MP_MODE:'live',MP_USER_ID:'123',MP_APPLICATION_ID:'456',MP_ACCESS_TOKEN:'APP_USR-fixture-only',...envPatch};
  const context=vm.createContext({AbortSignal,process:{env},fetch:async(url,options)=>{
    calls.push({url,options});
    if(!url.endsWith('/users/me') && failure) return {ok:false,status:503,json:async()=>{throw new Error('private response must not be read');}};
    return {ok:true,json:async()=>url.endsWith('/users/me')?merchant:{id,status:'canceled'}};
  }});
  const m=new vm.SourceTextModule(await readFile(new URL('../site/api/_lib/pix-mercadopago.js',import.meta.url),'utf8'),{context});
  await m.link(()=>new vm.SyntheticModule(['ORDER_ID','normalizeCpf'],function(){this.setExport('ORDER_ID',validation.ORDER_ID);this.setExport('normalizeCpf',validation.normalizeCpf);},{context}));
  await m.evaluate();return {api:m.namespace,calls,env};
}
test('cancel uses the official fixed endpoint, POST, an empty body and a stable key',async()=>{
  const a=await adapter();await a.api.cancelPixOrder(id,key);await a.api.cancelPixOrder(id,key);
  assert.equal(a.calls.length,3);
  for(const call of a.calls.slice(1)) {
    assert.equal(call.url,'https://api.mercadopago.com/v1/orders/'+id+'/cancel');
    assert.equal(call.options.method,'POST');assert.equal(call.options.body,'{}');assert.equal(call.options.headers['X-Idempotency-Key'],key);
    assert.equal(call.options.redirect,'error');assert(call.options.signal instanceof AbortSignal);
  }
});
test('invalid cancel ids and keys fail before any HTTP request',async()=>{
  const a=await adapter();
  for(const bad of ['https://evil.invalid',id+'/../users/me','ORDTST'+'A'.repeat(26),'',{},null]) await assert.rejects(a.api.cancelPixOrder(bad,key));
  for(const bad of ['',{},null,'A'.repeat(129),'with spaces','bad\nheader']) await assert.rejects(a.api.cancelPixOrder(id,bad));
  assert.equal(a.calls.length,0);
});
test('live adapter rejects test accounts and wrong merchant identity or country',async()=>{
  for(const merchant of [{id:123,country_id:'BR',tags:['test_user']},{id:999,country_id:'BR',tags:[]},{id:123,country_id:'AR',tags:[]},{id:123,country_id:'BR'}]) {
    const a=await adapter({merchant});await assert.rejects(a.api.cancelPixOrder(id,key),/merchant-mismatch/);assert.equal(a.calls.length,1);
  }
});
test('absent or sandbox configuration cannot silently enter the live adapter',async()=>{
  for(const envPatch of [{MP_MODE:'test'},{MP_ACCESS_TOKEN:''},{MP_USER_ID:''},{MP_APPLICATION_ID:''}]) {
    const a=await adapter({envPatch});assert.equal(a.api.pixConfigured(),false);await assert.rejects(a.api.cancelPixOrder(id,key),/not-configured/);assert.equal(a.calls.length,0);
  }
});
test('token rotation forces merchant revalidation instead of reusing the old identity cache',async()=>{
  const a=await adapter();await a.api.fetchPixOrder(id);a.env.MP_ACCESS_TOKEN='APP_USR-second-fixture';await a.api.fetchPixOrder(id);
  assert.equal(a.calls.filter(c=>c.url.endsWith('/users/me')).length,2);
  assert.equal(a.calls[2].options.headers.Authorization,'Bearer APP_USR-second-fixture');
});
test('provider failure preserves generic error metadata without reading a sensitive error body',async()=>{
  const a=await adapter({failure:true});
  await assert.rejects(a.api.cancelPixOrder(id,key),e=>e.message==='pix-provider-unavailable' && e.code==='mp-http-503');
});
test('follow-up lookup is a GET with no cancellation body or idempotency header',async()=>{
  const a=await adapter();await a.api.cancelPixOrder(id,key);await a.api.fetchPixOrder(id);
  const call=a.calls.at(-1);assert.equal(call.url,'https://api.mercadopago.com/v1/orders/'+id);
  assert.equal(call.options.method,'GET');assert.equal(call.options.body,undefined);assert.equal(call.options.headers['X-Idempotency-Key'],undefined);
});
