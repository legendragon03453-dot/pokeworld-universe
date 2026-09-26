import {GamePixService} from './game-pix-service.js';
import {GamePixStore,payerCipher} from './game-pix-store.js';
import {createGamePixHandler} from './game-pix-http.js';
import * as mp from './pix-mercadopago.js';
import * as ledger from './pix-orders.js';
export function configuredGamePixHandler() {
 if(process.env.PWU_GAME_PIX_ENABLED!=='true') return null;
 if(!mp.pixConfigured()) throw new Error('game-pix-provider-not-configured');
 return createGamePixHandler({service:new GamePixService({
  store:new GamePixStore(payerCipher(process.env.PWU_GAME_PIX_PAYER_KEY)),
  provider:{fetch:mp.fetchPixOrder,create:mp.createPixOrder,cancel:mp.cancelPixOrder},
  ledger:{bind:ledger.bindOrder,fulfill:ledger.fulfillOrder,flag:ledger.flagPayment},
  identity:{userId:process.env.MP_USER_ID,applicationId:process.env.MP_APPLICATION_ID}
 })});
}
