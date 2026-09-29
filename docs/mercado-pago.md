# Assinaturas Mercado Pago

Integração inicialmente desativada. Não colocar tokens no Git nem no frontend.

## Preparação

1. Aplicar `database/041_mercado_pago.sql` no banco da API após a migração 040.
2. Criar uma aplicação em Suas integrações no Mercado Pago. Ter uma conta Mercado Livre não configura a API automaticamente.
3. Configurar no ambiente do backend (não em variáveis NEXT_PUBLIC):

```
MP_BILLING_ENABLED=false
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_BACK_URL=https://SEU-DOMINIO/portal
```

4. Publicar a API com HTTPS e configurar no painel Mercado Pago o webhook `https://SUA-API/api/billing/webhook`. Habilitar `subscription_preapproval`, `subscription_authorized_payment` e `payment`. O retorno do checkout não é o webhook.
5. Configurar CORS_ORIGIN para o frontend e desativar DEV_AUTH_BYPASS. Cobranças são bloqueadas com autenticação de desenvolvimento.
6. Validar com contas de teste distintas de vendedor e comprador, conforme documentação do Mercado Pago, antes de habilitar produção. Não usar cartões reais nos testes.
7. Somente após homologação definir MP_BILLING_ENABLED=true e reiniciar a API. Token e segredo de webhook devem pertencer à mesma aplicação/ambiente.

## Fluxo implementado

Em Portal → Configurações → Minha assinatura, administrador escolhe Professor (R$29,90/mês ou R$299/ano) ou Escola (R$149,90/mês ou R$1499/ano). A API cria `/preapproval` pendente e redireciona para `init_point`. O ano é cobrado integralmente, não em 12 parcelas.

O backend valida HMAC da notificação, consulta a fatura e o pagamento na API do vendedor, verifica valor/moeda e grava o pagamento com ID único. Apenas pagamento aprovado concede acesso. Autorização da assinatura ou retorno do navegador não concede acesso. Notificações repetidas não somam novos períodos. Estornos/contestações de pagamentos conhecidos recalculam o acesso. Cancelar interrompe renovações e mantém acesso pago até o vencimento, sem solicitar reembolso.

GET /api/billing mostra status e últimos 24 pagamentos da instituição autenticada. POST /api/billing/checkout e POST /api/billing/cancel exigem administrador real e Origin permitido. POST /api/billing/webhook não usa sessão; exige assinatura válida. Erros temporários retornam falha para o provedor repetir a notificação.

## Limites e operação

- Sem troca imediata/prorrata: cancelar a assinatura atual e aguardar o fim do período pago para contratar outra. Contratações pendentes podem ser canceladas.
- Falha incerta durante criação mantém reserva `creating` para evitar cobranças duplicadas. Administrador técnico deve consultar `/preapproval/search` usando a referência externa (UUID do contrato), conferir o painel e reconciliar o ID/status. Não apagar reservas nem repetir POST sem verificar se a assinatura foi criada.
- Créditos de avaliações reiniciam por mês-calendário, inclusive no plano anual. Novos cadastros recebem 7 dias; cadastros anteriores não têm suas datas reescritas.
- Planos antigos `trial`/`school` são preservados. Esta etapa não implementa todas as cotas comerciais de professores, versões, questões manuais, armazenamento ou extração IA. Revisar e implementar essas cotas antes da venda pública; a página pública permanece como prévia.
- Cancelamento e expiração não apagam questões ou avaliações.
- Sem reconciliação periódica automática neste primeiro módulo. Monitorar entregas de webhook e repetir falhas pelo painel. Homologar renovação, perda/reenvio de eventos, estorno e cancelamento antes do lançamento.
- Não há promessa de Pix Automático ou boleto recorrente: os meios efetivamente disponíveis são os oferecidos pelo checkout de assinaturas da conta.

## Verificação

`node --test services/api/mercado-pago.test.mjs`

Homologação externa obrigatória: checkout com comprador de teste, pagamento inicial, renovação, assinatura autorizada sem pagamento (não liberar), notificação repetida e fora de ordem, estorno, cancelamento e tentativa de acesso entre instituições. Testes unitários não substituem essa homologação.

Referências oficiais consultadas em 29/09/2026:
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management
- https://www.mercadopago.com.br/developers/pt/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks
