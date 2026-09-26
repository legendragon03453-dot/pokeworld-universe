import {q} from './gamedb.js';
async function call(name,args) {
  const rows=await q(`CALL pwu_pix_${name}(${args.map(()=>'?').join(',')})`,args);
  return Array.isArray(rows[0]) ? rows[0][0] || null : null;
}
export const createOrder=(account,request,pkg,amount,credits)=>call('create',[account,request,pkg,amount,credits]);
export const readOrder=reference=>call('read',[reference]);
export const bindOrder=(account,reference,id)=>call('bind',[account,reference,id]);
export const flagPayment=(event,id,type)=>call('flag',[event,id,type]);
export const fulfillOrder=(local,remote,event)=>call('fulfill',[local.reference,Number(local.account_id),remote.id,event,
  Number(local.amount_cents),'BRL',remote.transactions.payments[0].id]);
