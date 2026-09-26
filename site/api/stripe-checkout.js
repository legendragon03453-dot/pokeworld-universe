/**
 * Checkout com Stripe (cartão internacional, Pix e mais conforme a conta).
 * POST /api/stripe-checkout { packageId, amount?, coupon? } -> { checkoutUrl }
 *
 * Mesma regra de ouro do Mercado Pago: o site manda SÓ o id do pacote.
 * Preço e coins vêm do catálogo do servidor (api/_lib/packages.js).
 */
import { stripeConfigured, stripeCall } from './_lib/stripe.js';
import { resolvePackage } from './_lib/packages.js';
import { findCoupon, precoComCupom } from './_lib/coupons.js';
import { createLocalOrder, attachMpOrderId } from './_lib/orders.js';
import { gameConfigured, one } from './_lib/gamedb.js';
import { accountFromRequest } from './_lib/session.js';

const APP_URL = (process.env.APP_URL || 'https://pokeworld-universe.vercel.app').replace(/\/+$/, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });
  if (!stripeConfigured() || !gameConfigured()) return res.status(503).json({ error: 'pagamento ainda não configurado no servidor' });

  try {
    const accountId = await accountFromRequest(req);
    if (!accountId) return res.status(401).json({ error: 'não autenticado' });
    const user = await one('SELECT id, email, name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
    if (!user) return res.status(401).json({ error: 'conta não encontrada' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; } }
    let pkg;




    try { pkg = resolvePackage(body && body.packageId, body && body.amount); } catch (e) { return res.status(400).json({ error: 'pacote inexistente' }); }

    const cupom = findCoupon(body && body.coupon);
    if (body?.coupon && !cupom) return res.status(400).json({error:'Cupom inválido ou expirado.'});
    const preco = precoComCupom(pkg, cupom);

    // Pedido com valor e créditos imutáveis, validados na confirmação.
    const local = await createLocalOrder({ userId: accountId, packageId: pkg.id, amount: preco, coins: pkg.coins, provider: 'stripe' });

    const session = await stripeCall('/checkout/sessions', {
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'brl',
      'line_items[0][price_data][unit_amount]': String(Math.round(preco * 100)),   // centavos, já com o cupom
      'line_items[0][price_data][product_data][name]': `PokeWorld Universe — ${pkg.title}`,
      'line_items[0][price_data][product_data][description]': `${pkg.coins} Diamond Points compartilhados na conta`,
      client_reference_id: local.reference,
      'metadata[order_id]': String(local.id),
      'metadata[account_id]': String(accountId),
      'metadata[package_id]': pkg.id,
      'metadata[coupon]': cupom ? cupom.code : '',
      customer_email: user.email || undefined,
      success_url: `${APP_URL}/minha-conta.html?pagamento=retorno`,
      cancel_url: `${APP_URL}/minha-conta.html?pagamento=falhou`
    }, { idempotencyKey: local.reference });

    // guarda o id da sessão no pedido (mesma coluna usada pelo Mercado Pago)
    await attachMpOrderId(local.id, session.id, 'stripe');

    return res.status(200).json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[stripe-checkout]', err);
    return res.status(500).json({ error: 'erro ao criar checkout' });
  }
}
