# Pix dentro do jogo — instalação pelo início normal

Atualizar este repositório e o cliente pelo procedimento habitual, compilar e reiniciar o jogo como de costume. Não há serviço Node novo no host do jogo, token permanente a configurar, SQL manual ou comando `/updateserver`. O usuário reservou a publicação/reinício do jogo ao Mozard.

O site oficial já recebeu a preparação desta integração em 26/09/2026, release `pwu-game-pix-20260926-v1`. Provedores e credenciais existentes foram preservados. As tabelas novas são instaladas somente quando o jogo carregar esta atualização.

## Inicialização

O carregador existente ordena os scripts; `data/scripts/00_pwu_payment_schema.lua` executa antes da ponte Pix. O manifesto versionado confere seu SHA-256, obtém bloqueio de instalação, verifica sete tabelas InnoDB e o gatilho canônico da carteira, registra as definições anteriores e aplica as etapas idempotentes. O usuário de banco já configurado no jogo precisa conservar os privilégios administrativos usados pela instalação existente; não há troca de senha ou usuário neste commit.

O banco precisa ser MariaDB compatível com `RANDOM_BYTES` (homologado em 10.11.14, versão do host conferida). A conta existente do site é `pwu_site_app@localhost`. Se os pré-requisitos forem incompatíveis, o Pix permanece indisponível com diagnóstico no console, sem improvisar permissões ou alterar saldos. Instalação parcial fica registrada e é retomada no próximo início; uma instalação desconhecida é recusada. Reinícios normais conferem as definições já instaladas.

O site responde indisponibilidade temporária aos pagamentos durante a migração ou enquanto o registro estiver incompleto. Webhooks não recebem confirmação de sucesso nessa situação. As definições anteriores ficam em `pwu_payment_schema_objects`; etapas e versão ficam em `pwu_payment_schema_journal`. Não restaurar saldos históricos por cima de pagamentos novos para desfazer uma atualização.

## Autenticação e integridade

O servidor identifica a conta autenticada e emite um ticket aleatório, válido por 60 segundos, de uso único, vinculado aos bytes do pedido. A ponte HTTPS chama `/api/game-pix`; o site consome esse ticket no banco para obter a conta. O site não pode emitir tickets; o cliente não recebe credenciais de provedor/banco. CPF não entra nas consultas SQL do jogo. Autorizações expiradas são removidas em lotes limitados.

Valores, bônus, conta recebedora, moeda e status são verificados no backend. O crédito é atômico na carteira existente, com recibo único. Fechar o QR pede cancelamento ao provedor; se o pagamento ganhar a corrida, preserva o crédito único. Resultado desconhecido exige reconciliação antes de um novo QR. Estorno e análise continuam manuais pelo suporte por e-mail; não há estorno financeiro automático nem recuperação automática de itens já gastos.

## Evidência da entrega

- Base do servidor: `97eac29899dbd17a6484b6a7b01597a1f30cde50`, incluindo cinco atualizações recentes do Mozard, sem alterar balanceamento.
- 47 casos do site, 27 do serviço/banco, 15 do transporte, 11 de instalação/recuperação, 20 Lua e sete da HUD aprovados: 127 casos, além das verificações nativas, permissões, cifragem e migração repetida.
- Concorrência do transporte: 1.500 chamadas em quinze lotes; limite persistente e nenhuma duplicação de autorização.
- Jogo compilado e executado localmente: instalação automática desde o esquema anterior, login, loja, dois QRs distintos após cancelamento e uma única operação de crédito; sem erros/avisos.
- Mercado Pago sandbox: criação, cancelamento efetivo, consulta e repetição de cancelamento confirmados, sem pagamento real. Corridas com pagamento e falhas de rede foram exercitadas em simulador determinístico.
- Site público: páginas 200, pagamentos sem autenticação e webhooks sem assinatura 401, fontes privadas 404.

Os binários locais possuem restrições de laboratório e não são distribuídos. O launcher público e um pagamento real dentro do jogo após a publicação ainda não foram verificados nesta entrega. Isso não é garantia de ausência absoluta de bugs. O relatório completo e os recibos ficam no checkpoint da Jarvis de 26/09/2026.


## Configuração do site

O host usa o runtime Node existente e o mesmo banco compartilhado. `PWU_GAME_PIX_ENABLED=true` habilita a rota; `PWU_GAME_PIX_PAYER_KEY` contém 32 bytes aleatórios em hexadecimal, gerados somente no host e preservados entre reinícios. Essa chave cifra temporariamente o CPF/e-mail até vincular o pedido ao provedor. Não versionar segredos. A configuração já foi aplicada no site oficial.

A rota usa tickets de uso único emitidos pelo jogo, rejeita chamadas de navegador, limita corpo e concorrência e pausa pagamentos durante instalação incompleta. A migração pertence ao commit do servidor; não reaplicar os SQLs completos históricos do site. O listener privado antigo foi mantido apenas como fixture dos testes e não deve ser executado em produção.

Testes sem banco: `node --experimental-vm-modules --test tests/stripe-production.test.mjs tests/pix-production.test.mjs tests/security-adversarial.test.mjs tests/pix-provider-boundary.test.mjs tests/payment-maintenance.test.mjs` (47 casos). Os testes de banco exigem fixture descartável em `127.0.0.1:13316`, MariaDB 10.11.14 e schema `pwu_release_` seguido de dez caracteres hexadecimais; recusam ambientes fora desse padrão.
