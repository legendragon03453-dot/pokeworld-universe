import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// A separate, private listener. It is not mounted in the public website router.
export function createGameBridge({service,token}) {
  if(!/^[0-9a-f]{64,128}$/i.test(token || '')) throw new Error('bridge-token-required');
  const expected=Buffer.from('Bearer '+token),rates=new Map();
  const timer=setInterval(()=>{const t=Date.now();for(const [k,v] of rates) if(t-v.at>60000) rates.delete(k);},60000);timer.unref();
  const server=http.createServer(async(req,res)=>{
    const respond=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
    if(req.method!=='POST' || req.url!=='/game-pix') return respond(404,{error:'not_found'});
    const auth=Buffer.from(req.headers.authorization || '');
    if(auth.length!==expected.length || !timingSafeEqual(auth,expected)) return respond(401,{error:'unauthorized'});
    if(req.headers['content-type']!=='application/json') return respond(415,{error:'invalid_request'});
    if(Number(req.headers['content-length'])>2048) return respond(413,{error:'invalid_request'});
    let bytes=0,chunks=[];
    try {
      for await(const chunk of req) {bytes+=chunk.length;if(bytes>2048) return respond(413,{error:'invalid_request'});chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!=='account,request' || !Number.isSafeInteger(input.account) || input.account<1) return respond(400,{error:'invalid_request'});
      const now=Date.now(),rate=rates.get(input.account);
      if(!rate || now-rate.at>=60000) {
        if(!rate && rates.size>=10000) return respond(429,{error:'rate_limited'});
        rates.set(input.account,{at:now,count:1});
      } else if(++rate.count>90) return respond(429,{error:'rate_limited'});
      return respond(200,await service.handle(input.account,input.request));
    } catch(error) {
      const publicErrors=['invalid_request','invalid_amount','invalid_order','invalid-cpf','request_conflict','order_not_found','account_review','account-email-invalid'];
      const code=publicErrors.includes(error.message)?error.message.replace('invalid-cpf','invalid_cpf'):'unavailable';
      return respond(code==='unavailable'?503:400,{error:code});
    }
  });
  server.on('close',()=>clearInterval(timer));
  server.requestTimeout=10000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  // No accidental production activation when the package is copied or opened.
  if(process.env.PWU_GAME_PIX_ENABLED!=='true') throw new Error('game-pix-disabled');
  const [{GamePixService},{GamePixStore,payerCipher},mp,ledger]=await Promise.all([
    import('../site/api/_lib/game-pix-service.js'),import('../site/api/_lib/game-pix-store.js'),
    import('../site/api/_lib/pix-mercadopago.js'),import('../site/api/_lib/pix-orders.js')]);
  if(!mp.pixConfigured()) throw new Error('provider-not-configured');
  const service=new GamePixService({store:new GamePixStore(payerCipher(process.env.PWU_GAME_PIX_PAYER_KEY)),
    provider:{fetch:mp.fetchPixOrder,create:mp.createPixOrder,cancel:mp.cancelPixOrder},
    ledger:{bind:ledger.bindOrder,fulfill:ledger.fulfillOrder,flag:ledger.flagPayment},
    identity:{userId:process.env.MP_USER_ID,applicationId:process.env.MP_APPLICATION_ID}});
  const server=createGameBridge({service,token:process.env.PWU_GAME_PIX_TOKEN});
  server.listen(17890,'127.0.0.1',()=>console.log('Private game Pix bridge ready on loopback'));
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
