# Pokeworld Universe — site oficial

Fontes do site https://pokeworlduniverse.com e do serviço Node que atende suas APIs.

## Sincronização da Stripe em produção

A integração de cartão está **implantada no servidor oficial** e foi validada com um pagamento real e entrega automática de Diamond Points no site e no jogo. Esta atualização do Git registra os fontes dessa implantação para manter as cópias dos desenvolvedores alinhadas. **Não é necessário publicar novamente o site nem executar novamente o SQL no servidor existente.**

- Instruções para o Mozart: [estado da implantação e atualização da cópia local](docs/stripe-producao.md).
- Serviço do host oficial: `runtime/server.mjs`.
- Interface e APIs: `site/`.
- Rotinas SQL específicas da Stripe: `sql/pwu-stripe-production.sql` (já instaladas em produção; não executar novamente).
- Testes sem pagamento e sem banco real: `node --experimental-vm-modules --test tests/stripe-production.test.mjs` (Node 24).

O domínio Vercel é uma configuração distinta. `site/vercel.json` não substitui o roteamento do host oficial. Chaves, configuração privada, dados dos jogadores e backups não fazem parte do repositório.
