import {createHmac} from 'node:crypto';
import {q} from './gamedb.js';

// A fingerprint binds the one-use ticket to the exact UTF-8 request bytes.
// This public domain separator is not an authentication secret. Only the
// authenticated game process can issue tickets through its database privilege.
export const fingerprint = bytes => createHmac('sha256','pwu-game-pix-request-v1').update(bytes).digest('base64');
export async function consumeTicket(token,hash) {
 const result=await q('CALL pwu_game_pix_consume_ticket(?,?)',[token,hash]);
 const account=Number(result[0]?.[0]?.account_id);
 return Number.isSafeInteger(account) && account>0 ? account : null;
}
export function createGamePixHandler({service,consume=consumeTicket}) {
 let inflight=0;const invalid=new Map();
 return async function handle(req,res) {
  const reply=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
  if(req.method!=='POST') return reply(405,{error:'invalid_request'});
  if(req.headers.origin || req.headers['sec-fetch-site']) return reply(403,{error:'unauthorized'});
  const match=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if(!match) return reply(401,{error:'unauthorized'});
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return reply(415,{error:'invalid_request'});
  if(req.headers['content-encoding'] || Number(req.headers['content-length'])>1024) return reply(413,{error:'invalid_request'});
  const ip=req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown',now=Date.now();
  const prior=invalid.get(ip);
  if(prior && now-prior.at>=60000) invalid.delete(ip);
  if(invalid.get(ip)?.count>=120 || inflight>=64) return reply(429,{error:'rate_limited'});
  if(invalid.size>=10000) {
   for(const [key,value] of invalid)if(now-value.at>=60000)invalid.delete(key);
   if(invalid.size>=10000 && !invalid.has(ip))return reply(429,{error:'rate_limited'});
  }
  inflight++;
  try {
   const chunks=[];let size=0;
   for await(const chunk of req) {size+=chunk.length;if(size>1024)return reply(413,{error:'invalid_request'});chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);
   let body;try {body=JSON.parse(bytes.toString('utf8'));} catch {return reply(400,{error:'invalid_request'});}
   const account=await consume(match[1],fingerprint(bytes));
   if(!account) {
    const count=invalid.get(ip);invalid.set(ip,{at:count?.at||now,count:(count?.count||0)+1});
    return reply(401,{error:'unauthorized'});
   }
   return reply(200,await service.handle(account,body));
  } catch(error) {
   const known=['invalid_request','invalid_amount','invalid_order','invalid-cpf','request_conflict','order_not_found','account_review','account-email-invalid'];
   const code=known.includes(error.message)?error.message.replace('invalid-cpf','invalid_cpf'):'unavailable';
   return reply(code==='unavailable'?503:400,{error:code});
  } finally {inflight--;}
 };
}
