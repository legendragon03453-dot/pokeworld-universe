# Banco do jogo e integração do site

O site oficial autentica contas e consulta personagens no mesmo banco MariaDB do jogo. A carteira usada pela integração Stripe atual é **`accounts.diamond_points`**, compartilhada entre os personagens da conta. Não usar a antiga referência `accounts.pontos` para esta integração.

`pwu-stripe-production.sql` registra os objetos adicionados à instalação de produção: pedidos, revisões e rotinas de criação, vinculação e confirmação. A entrega passa por `pwu_diamond_operations` e seu trigger transacional existente, sem conceder UPDATE direto no saldo ao usuário do site.

**A migration já foi aplicada no servidor oficial. Não executar novamente para atualizar a cópia local do Git.** Ela não é idempotente e depende da carteira, trigger, contas e colunas de histórico já instalados. Não configura uma base vazia nem contém dados reais de jogadores.

Consulte [Stripe em produção](../docs/stripe-producao.md) para roteamento, dependências, testes e operação.

`site-tables.sql` é a tabela opcional de snapshots utilizada pelo ranking de ganho de experiência. Não é uma migration da carteira nem do pagamento Stripe.
