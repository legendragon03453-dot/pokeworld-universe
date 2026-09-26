import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {GamePixStore,payerCipher} from '../site/api/_lib/game-pix-store.js';
import {pool,q} from '../site/api/_lib/gamedb.js';
import * as ledger from '../site/api/_lib/pix-orders.js';
assert.equal(process.env.GAME_DB_HOST,'127.0.0.1');assert.equal(process.env.GAME_DB_PORT,'13316');
assert.match(process.env.GAME_DB_USER,/^pwu_bridge_test_/);assert.match(process.env.GAME_DB_NAME,/^pwu_release_/);
const store=new GamePixStore(payerCipher(process.env.PWU_GAME_PIX_PAYER_KEY));
try {
  const local=await store.create(99,randomUUID(),15000,168,'52998224725');
  const tag='9'.repeat(26);await ledger.bindOrder(99,local.reference,'ORD'+tag);
  const lease=await store.lease(99,local.reference);assert(lease);
  await store.update(99,local.reference,lease,'pending',{bound:true});await store.release(99,local.reference,lease);
  await ledger.fulfillOrder(local,{id:'ORD'+tag,transactions:{payments:[{id:'PAY'+tag}]}},'least_privilege_test');
  assert.equal(await store.balance(99),168);
  await assert.rejects(q('UPDATE accounts SET diamond_points=999999 WHERE id=99'),/denied/i);
  await assert.rejects(q("INSERT INTO pwu_diamond_operations(operation_id,target_account,amount,reason) VALUES(?,99,999999,'pix_live')",[randomUUID()]),/denied/i);
  console.log('PASS: bridge can use its scoped tables and receipt procedure; direct balance update and direct credit insertion denied.');
} finally {await pool().end();}
