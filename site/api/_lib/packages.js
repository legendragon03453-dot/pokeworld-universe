/**
 * Catálogo de pacotes de Diamond Points do PokeWorld Universe.
 *
 * REGRA DE OURO: o preço e a quantidade de Diamond Points vivem AQUI, no servidor.
 * O frontend manda só o `id` do pacote. Se o preço viesse do cliente,
 * qualquer pessoa compraria 1.950 Diamond Points por R$ 1 com o DevTools aberto.
 *
 * Base: 1 crédito por R$ 1. O bônus é o degrau por faixa e já vem somado
 * em `credits` (o total que o jogador recebe).
 *
 * `num` é o que vai para `historico_pagamentos.id_pacote`, que no banco do
 * jogo é int(11): gravar 'ultra' ali falha (modo estrito) ou vira 0, e o
 * webhook deixa de reconhecer o pacote. A faixa 901+ não colide com os ids
 * da tabela `pacotes` da loja do jogo.
 */

export const PACKAGES = {
  plus:    { id: 'plus',    num: 901, title: '108 Créditos',   price: 100,  credits: 108,  bonusPct: 8  },
  premium: { id: 'premium', num: 902, title: '168 Créditos',   price: 150,  credits: 168,  bonusPct: 12 },
  master:  { id: 'master',  num: 903, title: '236 Créditos',   price: 200,  credits: 236,  bonusPct: 18 },
  ultra:   { id: 'ultra',   num: 904, title: '500 Créditos',   price: 400,  credits: 500,  bonusPct: 25 },
  legend:  { id: 'legend',  num: 905, title: '1.280 Créditos', price: 1000, credits: 1280, bonusPct: 28 },
  mythic:  { id: 'mythic',  num: 906, title: '1.950 Créditos', price: 1500, credits: 1950, bonusPct: 30 },
};

/* ---------- valor livre ----------
 * O jogador pode doar qualquer valor entre CUSTOM_MIN e CUSTOM_MAX. O bônus é o
 * da maior faixa que o valor alcança (R$ 130 -> 8%, R$ 450 -> 25%); abaixo de
 * R$ 100 não há bônus. Vai para o banco com id_pacote = CUSTOM_NUM.
 */
export const CUSTOM_MIN = 10;
export const CUSTOM_MAX = 20000;
export const CUSTOM_NUM = 900;

export function bonusPctFor(price) {
  let pct = 0;
  for (const p of Object.values(PACKAGES)) if (price >= p.price && p.bonusPct > pct) pct = p.bonusPct;
  return pct;
}

export function customPackage(amount) {
  const price = Math.round(Number(amount) * 100) / 100;
  if (!(price >= CUSTOM_MIN && price <= CUSTOM_MAX)) throw new Error(`Valor fora da faixa: ${amount}`);
  const bonusPct = bonusPctFor(price);
  const credits = Math.floor(price * (1 + bonusPct / 100));
  return { id: 'custom', num: CUSTOM_NUM, title: `Doação de R$ ${price.toFixed(2).replace('.', ',')}`, price, credits, coins: credits, bonusPct, custom: true };
}

/** Pacote do catálogo ou, para 'custom', o pacote montado a partir do valor. */
export function resolvePackage(id, amount) {
  return id === 'custom' ? customPackage(amount) : getPackage(id);
}

/** id textual ('ultra') a partir do número gravado no banco (904). */
export function packageIdFromNum(num) {
  const n = Number(num);
  if (n === CUSTOM_NUM) return 'custom';
  const pkg = Object.values(PACKAGES).find((p) => p.num === n);
  return pkg ? pkg.id : null;
}

export function getPackage(id) {
  const pkg = typeof id === 'string' && Object.hasOwn(PACKAGES, id) ? PACKAGES[id] : null;
  if (!pkg) throw new Error(`Pacote inexistente: ${id}`);
  // `coins` fica como apelido de `credits` para o código que já usa esse nome.
  return { ...pkg, coins: pkg.credits };
}

/** Quanto de bônus o jogador ganhou, em Diamond Points. Só para exibir no recibo. */
export function bonusCredits(pkg) {
  return pkg.credits - pkg.price;
}
