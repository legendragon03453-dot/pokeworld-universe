# Stripe em produção — sincronização dos fontes

Estado de referência: 24/09/2026, horário de São Paulo.

## Para o Mozart atualizar a própria cópia

O servidor oficial **já está atualizado**. O titular fez uma compra real; a Stripe confirmou o pagamento, o sistema creditou a carteira e o saldo foi confirmado no site e pelo comando `/saldo` no jogo. Este envio ao GitHub registra os mesmos fontes implantados e acrescenta documentação/testes reproduzíveis. Não é uma solicitação de nova implantação.

Este commit pertence somente ao repositório do site `legendragon03453-dot/pokeworld-universe`. Não altera os repositórios `pwu-server`, `pwu-client`, `pwu-data` ou `pwu-tools`. Não contém mudanças de magias, balanceamento, mapas ou lógica de combate. O trabalho do Mozart nesses repositórios deve continuar separadamente.

As alterações estão na branch `codex/stripe-producao-site-oficial` do fork `Kaiquearduini/pokeworld-universe`, enviadas para revisão no repositório original. A conta conectada não possui escrita direta em `legendragon03453-dot/pokeworld-universe`. Antes de trocar de branch, confira `git status` e preserve qualquer trabalho local. Com a árvore limpa, execute **dentro da cópia do repositório do site**:

```sh
git fetch https://github.com/Kaiquearduini/pokeworld-universe.git codex/stripe-producao-site-oficial
git switch -c codex/stripe-producao-site-oficial FETCH_HEAD
```

Se a branch já existir localmente, após o mesmo fetch use `git switch codex/stripe-producao-site-oficial` e `git merge --ff-only FETCH_HEAD`. Se houver divergência ou alterações locais, revise antes de integrar; não descarte arquivos para forçar a atualização. Depois da integração do PR à principal do repositório original, a atualização normal de `main` será suficiente.

**Não reaplicar `sql/pwu-stripe-production.sql`, alterar saldos, substituir a configuração privada ou reiniciar serviços só para sincronizar o Git.** A migration é o registro da instalação inicial, não um script idempotente de atualização.

## Fluxo ativo

1. O jogador entra no site oficial usando a conta do jogo. A sessão autenticada fornece o identificador da conta; o navegador não escolhe o destinatário.
2. O servidor calcula pacote, valor, bônus e créditos. Por exemplo, R$100 correspondem a 108 Diamond Points.
3. O pedido persistido guarda referência única e conta. O Checkout hospedado da Stripe recebe apenas cartão, BRL e autenticação 3DS solicitada.
4. O navegador é redirecionado à Stripe. O retorno ao site não autoriza crédito.
5. O webhook valida a assinatura dos bytes originais e o ambiente live, consulta a sessão independentemente na Stripe e confere valor, moeda, referência e conta.
6. A rotina transacional do banco registra a entrega única. O saldo canônico é `accounts.diamond_points`, compartilhado entre os personagens da conta. Não usar `accounts.pontos` para esta integração.

O fluxo de produção atende contas válidas existentes e novas. Não existe restrição ao personagem utilizado no teste. Contas com pagamento sob revisão podem ter novas compras bloqueadas.

## Arquivos e roteamento

| Responsabilidade | Arquivo |
|---|---|
| Serviço HTTP, isolamento de rotas e proteções | `runtime/server.mjs` |
| Checkout real | `site/api/stripe-live-checkout.js` |
| Webhook real | `site/api/webhook/stripe-live.js` |
| Validação do pedido e da resposta Stripe | `site/api/_lib/stripe-live-validation.js` |
| Chamada Stripe e assinatura | `site/api/_lib/stripe.js` |
| Acesso às rotinas da carteira | `site/api/_lib/stripe-orders.js` |
| Pacotes e bônus | `site/api/_lib/packages.js` |
| Rotinas persistentes | `sql/pwu-stripe-production.sql` |

No host oficial, o serviço Node mapeia `/api/stripe-checkout` para `stripe-live-checkout.js` e `/api/webhook/stripe` para `webhook/stripe-live.js`. Os arquivos legados `stripe-checkout.js` e `webhook/stripe.js` não são os handlers usados pelo serviço oficial. Copiar somente `site/` para outra hospedagem não reproduz essa arquitetura. Esta entrega não altera a hospedagem Vercel.

Os fontes incluem as adaptações de sessão, verificação de e-mail, criação de personagem e leitura da carteira que já existiam no host e são dependências desta versão. Não é necessário recompilar cliente/servidor para esta sincronização do site.

## Configuração privada existente

O host carrega `/etc/pwu-site/site.env`, fora dos arquivos públicos. Preservar esse arquivo e o túnel/conexão privada com o banco. O processo escuta somente em loopback; o Nginx encaminha as requisições, limita seu tamanho/frequência e sobrescreve os cabeçalhos do proxy. Não expor o processo Node diretamente na internet.

`runtime/site.env.example` documenta nomes de opções sem segredos e vem desativado por padrão. Não substituir o arquivo de produção pelo exemplo. As chaves de Stripe, assinatura do webhook, sessão, banco e e-mail são configuradas apenas no servidor.

O banco já possui a carteira `accounts.diamond_points`, o registro `pwu_diamond_operations`, o trigger de aplicação atômica da carteira, as colunas de histórico e as tabelas de autenticação. A migration da Stripe depende desses objetos existentes; não provisiona uma instalação vazia. O usuário SQL da aplicação tem somente as permissões necessárias, com EXECUTE nas rotinas específicas, sem UPDATE direto no saldo. Não criar permissões amplas para tentar contornar erros de instalação.

Webhook configurado em `https://pokeworlduniverse.com/api/webhook/stripe` para:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.closed`

Descrição configurada na Stripe: **PWU ONLINE**. A apresentação final na fatura depende do banco emissor. O Checkout pode exibir a razão social cadastrada na Stripe.

## Operação, revisão e recuperação

Duplicidade de evento, sessão ou operação não deve duplicar crédito. Os testes de banco verificaram repetição e concorrência em schema isolado.

Estorno/contestação registra revisão e bloqueia novas compras da conta afetada. A equipe deve revisar os registros e o painel Stripe. **Não há reembolso automático, retirada automática dos pontos já gastos ou desbloqueio automático após encerramento de disputa.** Não editar o saldo ou remover a revisão sem conciliar o pagamento e registrar a decisão operacional.

Se for necessário pausar novas compras em uma ocorrência futura, desativar apenas `PWU_STRIPE_ENABLED`, mantendo `PWU_STRIPE_WEBHOOK_ENABLED=true`. O processo precisa recarregar a configuração para uma alteração surtir efeito. Não trocar o código para uma versão antiga nem remover tabelas enquanto existirem pagamentos pendentes de confirmação. Essas ações não são necessárias para atualizar a cópia do desenvolvedor.

## Evidências e limites

- Pagamento real de R$10: aprovado e creditado automaticamente em 10 Diamond Points; saldo confirmado pelo titular dentro do jogo.
- 33 verificações de banco em schema isolado, 9 grupos de testes Node e 9 verificações no domínio público realizados durante a implantação.
- O teste Node abaixo reproduz as verificações da aplicação com dados fictícios, handlers de banco simulados e servidor HTTP local temporário. Não faz cobrança nem se conecta ao banco real.

```sh
node --experimental-vm-modules --test tests/stripe-production.test.mjs
```

Essas verificações não constituem auditoria completa contra invasão e não eliminam fraude/contestação. Uma compra real bem-sucedida não prova todas as situações de banco, cartão ou conta. Não refazer pagamentos reais apenas para sincronizar os fontes.

## Stone/Pix e módulo futuro

Stone/Pix permanece desativado, aguardando a integração. O usuário definiu que o futuro módulo de pagamento dentro do jogo terá **somente Pix pela Stone** e usará a mesma carteira da conta. Cartão continua no site com redirecionamento ao Checkout Stripe. Nenhuma configuração Stone nem esse módulo futuro foi implementado neste envio.
