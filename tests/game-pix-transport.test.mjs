import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import mysql from '../site/node_modules/mysql2/promise.js';
import {createGamePixHandler,fingerprint,consumeTicket} from '../site/api/_lib/game-pix-http.js';
import {gameInput} from '../site/api/_lib/game-pix-service.js';
import {createApp} from '../runtime/server.mjs';
import {pool,q,one} from '../site/api/_lib/gamedb.js';
import {paymentMaintenance} from '../site/api/_lib/payment-maintenance.js';
assert.equal(process.env.GAME_DB_HOST,'127.0.0.1');assert.equal(process.env.GAME_DB_PORT,'13316');
assert.match(process.env.GAME_DB_NAME,/^pwu_release_[a-f0-9]{10}$/);
let calls=[];
const service={async handle(account,body){gameInput(body);calls.push({account,body});return {account,action:body.action};}};
const server=createApp({gamePixHandler:createGamePixHandler({service})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
after(async()=>{await new Promise(resolve=>server.close(resolve));await pool().end();});
const raw=JSON.stringify({action:'recover'});
async function ticket(account=80,text=raw){return (await one('SELECT pwu_game_pix_issue_ticket(?,?) AS token',[account,fingerprint(Buffer.from(text))])).token;}
function request(token,text=raw,{method='POST',headers={},url='/api/game-pix'}={}){
 return new Promise((resolve,reject)=>{
  const r=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...headers}},res=>{
   let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));
  });r.on('error',reject);r.end(text);
 });
}
test('same MariaDB version as recorded host, no external server',async()=>{
 const row=await one('SELECT VERSION() AS version,@@bind_address AS host');assert.match(row.version,/^10\.11\.14/);assert.equal(row.host,'127.0.0.1');
});
test('installation starts disabled and issues no ticket',async()=>{assert.equal(await ticket(),null);await q('UPDATE pwu_game_pix_control SET enabled=TRUE WHERE id=1');});
test('normal website runtime accepts exact request once with DB-bound account',async()=>{
 const t=await ticket();assert.match(t,/^[a-f0-9]{64}$/);assert.equal((await request(t)).body.account,80);assert.equal((await request(t)).status,401);
});
test('body mutation, whitespace mutation and foreign account cannot use a ticket',async()=>{
 const t=await ticket();for(const text of [raw+' ',JSON.stringify({action:'recover',account:81}),JSON.stringify({action:'quote',amountCents:15000})])assert.equal((await request(t,text)).status,401);
 assert.equal((await request(t)).status,200);
});
test('twenty parallel replays invoke the service exactly once',async()=>{
 const t=await ticket();const before=calls.length;const replies=await Promise.all(Array.from({length:20},()=>request(t)));
 assert.equal(replies.filter(r=>r.status===200).length,1);assert.equal(calls.length-before,1);assert(replies.every(r=>[200,401].includes(r.status)));
});
test('unknown or expired ticket never invokes payments',async()=>{
 const t=await ticket();await q('UPDATE pwu_game_pix_tickets SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)');
 const before=calls.length;assert.equal((await request(t)).status,401);assert.equal((await request(randomBytes(32).toString('hex'))).status,401);assert.equal(calls.length,before);
});
test('disabling transport revokes tickets without touching receipts or balances',async()=>{
 const t=await ticket();const balance=await one('SELECT SUM(diamond_points) AS n FROM accounts');
 await q('UPDATE pwu_game_pix_control SET enabled=FALSE WHERE id=1');assert.equal((await request(t)).status,401);assert.equal(await ticket(),null);
 assert.deepEqual(await one('SELECT SUM(diamond_points) AS n FROM accounts'),balance);await q('UPDATE pwu_game_pix_control SET enabled=TRUE WHERE id=1');
});
test('rate limit persists across connections and cannot be bypassed concurrently',async()=>{
 for(let n=0;n<15;n++) {
  await q('UPDATE pwu_game_pix_ticket_limits SET window_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 61 SECOND) WHERE account_id=81');
  const issued=await Promise.all(Array.from({length:100},()=>ticket(81)));assert.equal(issued.filter(Boolean).length,90);assert.equal(new Set(issued.filter(Boolean)).size,90);
 }
 await q('UPDATE pwu_game_pix_ticket_limits SET window_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 61 SECOND) WHERE account_id=81');assert(await ticket(81));
});
test('invalid identity or fingerprint cannot issue authorization',async()=>{
 for(const a of [null,0,-1,2147483647])assert.equal(await ticket(a),null);
 for(const h of [null,'','bad','a'.repeat(44)])assert.equal((await one('SELECT pwu_game_pix_issue_ticket(80,?) AS token',[h])).token,null);
});
test('database contains hash only and request fingerprint, no bearer token or CPF',async()=>{
 const text=JSON.stringify({action:'create',requestId:'a31c7390-12ef-49fa-9a2a-c4dfca19d4ef',amountCents:15000,cpf:'52998224725'});
 const t=await ticket(80,text);const rows=JSON.stringify(await q('SELECT * FROM pwu_game_pix_tickets'));assert(!rows.includes(t));assert(!rows.includes('52998224725'));
});
test('HTTP refuses browsers, invalid methods, oversized bodies and URL query',async()=>{
 for(const [options,text,code] of [[{method:'GET'},raw,405],[{headers:{origin:'https://pokeworlduniverse.com'}},raw,403],[{headers:{'sec-fetch-site':'same-origin'}},raw,403],[{headers:{'content-type':'text/plain'}},raw,415],[{},'x'.repeat(1025),413],[{url:'/api/game-pix?x=1'},raw,400],[{},'{broken',400]]){
  const t=await ticket();assert.equal((await request(t,text,options)).status,code);
 }
});
test('authenticated extra account or credit fields are refused by service validation',async()=>{
 const text=JSON.stringify({action:'recover',account:81,credits:999999});const t=await ticket(80,text);const before=calls.length;
 assert.equal((await request(t,text)).status,400);assert.equal(calls.length,before);
});
test('restricted site principal can consume but cannot issue, insert tickets, or alter wallets',async()=>{
 const user='ticket_site_'+randomBytes(4).toString('hex'),pass=randomBytes(32).toString('hex'),db=process.env.GAME_DB_NAME;
 await q(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY '${pass}' REQUIRE SSL`);
 await q(`GRANT EXECUTE ON PROCEDURE ${db}.pwu_game_pix_consume_ticket TO '${user}'@'127.0.0.1'`);
 const c=await mysql.createConnection({host:'127.0.0.1',port:13316,user,password:pass,database:db,ssl:{ca:process.env.GAME_DB_SSL_CA,rejectUnauthorized:true}});
 try{
  const t=await ticket();const [result]=await c.execute('CALL pwu_game_pix_consume_ticket(?,?)',[t,fingerprint(Buffer.from(raw))]);assert.equal(result[0][0].account_id,80);
  for(const sql of ["SELECT pwu_game_pix_issue_ticket(80,'"+fingerprint(Buffer.from(raw))+"')",'INSERT INTO pwu_game_pix_tickets SELECT * FROM pwu_game_pix_tickets','UPDATE accounts SET diamond_points=diamond_points+1 WHERE id=80'])await assert.rejects(c.query(sql),e=>[1142,1370].includes(e.errno));
 }finally{await c.end();}
});
test('unconfigured existing website keeps game endpoint unavailable',async()=>{
 const old=createApp();await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));
 try{const r=await fetch('http://127.0.0.1:'+old.address().port+'/api/game-pix',{method:'POST'});assert.equal(r.status,503);}finally{await new Promise(resolve=>old.close(resolve));}
});

test('real DB maintenance sees installation lock and unfinished journal, then resumes safely',async()=>{
 assert.equal(await paymentMaintenance(),false);
 const installer=await pool().getConnection();
 try {
  await installer.query("SELECT GET_LOCK('pwu-payment-schema-upgrade',0)");assert.equal(await paymentMaintenance(),true);
  await installer.query("SELECT RELEASE_LOCK('pwu-payment-schema-upgrade')");assert.equal(await paymentMaintenance(),false);
  await q('CREATE TABLE pwu_payment_schema_journal(version VARCHAR(64) PRIMARY KEY,state VARCHAR(16)) ENGINE=InnoDB');
  await q("INSERT INTO pwu_payment_schema_journal VALUES('pwu-payments-20260926-v1','applying')");assert.equal(await paymentMaintenance(),true);
  await q("UPDATE pwu_payment_schema_journal SET state='complete'");assert.equal(await paymentMaintenance(),false);
 }finally {await installer.query("SELECT RELEASE_LOCK('pwu-payment-schema-upgrade')");installer.release();}
});
