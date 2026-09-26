import {one} from './gamedb.js';
// The game holds this DB lock only while installing the prepared schema.
// Webhooks receive 503 and retry; no successful event is acknowledged early.
export async function paymentMaintenance() {
 const row=await one("SELECT IS_USED_LOCK('pwu-payment-schema-upgrade') IS NOT NULL AS busy");
 if(Number(row?.busy)!==0)return true;
 const installed=await one("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pwu_payment_schema_journal'");
 if(Number(installed?.n)===0)return false;
 const journal=await one("SELECT state FROM pwu_payment_schema_journal WHERE version='pwu-payments-20260926-v1'");
 return journal ? journal.state!=='complete' : false;
}
