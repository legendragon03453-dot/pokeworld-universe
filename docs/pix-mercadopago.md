# Pix Mercado Pago no site oficial

Escopo: `pokeworlduniverse.com`, Pix pela API de Orders e cartão pela Stripe existente. Não altera arquivos do jogo, magias ou balanceamento. A implantação não é comprovada apenas por este documento: consultar o relatório datado e os recibos do servidor.

## Identificação exibida

`PWU SITE` é o nome interno da aplicação Mercado Pago 2665215422624527. O pedido Pix usa `PWU ONLINE - N Diamond Points`. Essa descrição não substitui o nome legal do recebedor no banco do pagador. A apresentação do recebedor depende do cadastro validado no Mercado Pago e deve ser conferida na prévia/comprovante do banco. Não usar `statement_descriptor`, destinado à fatura do cartão, como garantia de nome no Pix.

## Fluxo e proteção do saldo

1. `/api/checkout` usa `pix-checkout.js`, autentica a conta do jogo e calcula pacote, preço e bônus no servidor.
2. Um pedido persistido associa conta, valor, créditos e referência. Repetições da mesma solicitação usam a mesma referência e a mesma chave de idempotência no Mercado Pago.
3. A API cria somente Pix automático em BRL, com vencimento de duas horas, e devolve a página de pagamento hospedada em `www.mercadopago.com.br/payments/.../ticket`.
4. `/api/webhook/mercadopago` usa `webhook/pix-live.js`. A assinatura, timestamp e identificação da notificação são validados. O estado do pedido é consultado diretamente no Mercado Pago.
5. O crédito depende de ambiente real, recebedor/aplicação corretos, referência persistida, moeda e valores exatos, um único pagamento Pix e estados `processed/accredited` no pedido e no pagamento. Redirecionamento do navegador não libera pontos.
6. As rotinas `pwu_pix_*` registram a entrega única através de `pwu_diamond_operations`. O saldo continua em `accounts.diamond_points`, compartilhado entre personagens da mesma conta. Não existe permissão nova de UPDATE direto na carteira.

Estornos e situações de disputa observadas na Order ficam para revisão manual. Não há devolução de dinheiro nem retirada automática de créditos já gastos. Webhook inválido recebe rejeição; falha temporária de consulta ou banco recebe erro para que o provedor tente novamente.

## Configuração e implantação

As credenciais existem somente no servidor, fora do diretório público e do Git. `MP_MODE=live`, `MP_USER_ID` e `MP_APPLICATION_ID` precisam corresponder à conta real. Credenciais de teste também começam com `APP_USR`; o prefixo não comprova produção. O backend consulta `/users/me` e rejeita usuário de teste. IDs `ORDTST...` são recusados na entrega real.

`PWU_PIX_ENABLED` permite novas cobranças; `PWU_PIX_WEBHOOK_ENABLED` mantém confirmações disponíveis mesmo quando novas cobranças estiverem pausadas. Não habilitar antes de instalar e verificar as rotinas, a credencial e a assinatura do webhook. As opções Stripe são independentes.

`sql/pwu-pix-production.sql` é uma instalação aditiva única, dependente da carteira e do histórico existentes. Não reaplicar se as tabelas/rotinas já existirem. O procedimento de implantação confere os hashes do código publicado, prepara release separada e conserva a versão anterior. Divergência no host exige revisão, não sobrescrita automática.

Os arquivos legados `checkout.js` e `webhook/mercadopago.js` não são os handlers oficiais deste fluxo. O serviço `runtime/server.mjs` precisa acompanhar a alteração; não publicar somente os arquivos estáticos ou presumir o mesmo roteamento na Vercel.

## Verificação

Em 25/09/2026, a integração foi instalada no site oficial com backup da versão anterior. A página pública gerou QR Code e Pix Copia e Cola em produção, e uma notificação real de pedido pendente foi autenticada e respondida com HTTP 200 sem liberar créditos. Na página de pagamento, o recebedor aparece como AVANTE LABS LTDA e a descrição como PWU ONLINE.

Foram aprovados 15 grupos de testes Node (Stripe e Pix), 33 verificações de banco isolado e uma cobrança Pix na API de teste com estado `processed/accredited`. Depois, o titular pagou o Pix real de R$ 10: o provedor confirmou `processed/accredited`, o webhook entregou os 10 Diamond Points automaticamente e o saldo passou de 10 para 20 tanto no banco do jogo quanto na página Minha Conta. A conferência visual do comando `/saldo` no cliente continua a cargo do titular; não houve crédito manual.

Executar `node --experimental-vm-modules --test tests/stripe-production.test.mjs tests/pix-production.test.mjs`. São testes locais com dados fictícios e dependências simuladas; não movimentam dinheiro. O teste da API Mercado Pago e os testes de banco isolado têm recibos próprios. Um pagamento de teste nunca deve creditar uma conta real.

Trocar futuramente o provedor Pix exige integração e validação específicas da Stone. Pedidos já emitidos continuam associados ao provedor original; não repetir automaticamente uma cobrança em outro provedor quando o resultado anterior for desconhecido.

## E-mail, CPF e cupom na mesma linha — 25/09/2026

A opção pública se chama Pix, com ícone genérico de QR Code. E-mail da conta autenticada, CPF e cupom aparecem na mesma linha da própria página, com as fontes do site; no celular, ficam empilhados. O valor escolhido anteriormente permanece no resumo e não há outro campo de quantidade. Não há diálogo nem etapa adicional: clicar em Pix valida o CPF e abre o pagamento diretamente. Stripe continua funcionando sem exigir CPF nesse formulário. Foram removidos os avisos visuais de descrição/fatura; a identificação PWU ONLINE enviada aos provedores permanece.

O CPF do pagador é obrigatório para Pix por decisão do proprietário do site. Navegador e servidor verificam ambos os dígitos verificadores, tamanho e sequências repetidas. Isso não é consulta à Receita Federal nem prova de identidade ou titularidade. A autorização e a confirmação continuam dependentes do provedor.

O CPF segue no corpo do POST autenticado e é encaminhado a payer.identification na API Mercado Pago. Não faz parte da URL, e-mail de conta, registros de pedidos, carteira ou resposta do endpoint. Não é salvo em localStorage/sessionStorage nem em atributos de HTML; o campo é limpo ao sair da página ou trocar de sessão. Os logs da aplicação registram apenas códigos de erro, e o proxy precisa permanecer sem registro de corpos de requisição. O Mercado Pago trata esse dado como parte do pagamento.

Publicar juntos pagamento.html, pages.js, pages.css e os três módulos backend Pix quando atualizar uma versão anterior à validação do CPF. Páginas antigas abertas precisam ser atualizadas. O CPF não altera o destinatário dos pontos, definido pela sessão autenticada no servidor. Nenhuma migração de banco ou atualização do jogo é necessária.

Validação do CPF e segurança: 17 grupos de testes locais de Pix/Stripe, bloqueio de CPF inválido antes de criar pedidos, payload encaminhado ao provedor e teste da API Mercado Pago com CPF documentado, confirmado processed/accredited. A apresentação direta foi conferida em prévia local com dados fictícios, sem nova cobrança real.

Fontes: [Pix Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix), [Criar Order](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/create-order/post).
