# Confirmação de e-mail e recuperação de senha

Novos cadastros por senha recebem um link de confirmação e não criam sessão até confirmar o endereço. Contas anteriores à migração 067 mantêm acesso sem serem marcadas como verificadas. O Google continua validando a posse do e-mail no seu próprio fluxo.

## Configuração no backend

1. Aplicar `database/067_auth_email_verification.sql` pelo processo de migração, antes de iniciar a nova API.
2. Configurar um domínio remetente verificado no Resend, seguindo https://resend.com/docs/dashboard/domains/introduction.
3. Definir `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (exemplo: `UfaProva <conta@seu-dominio.com>`) e `AUTH_FRONTEND_URL` (origem HTTPS do portal).
4. Manter `AUTH_DEV_RESET_TOKENS=false`, `DEV_AUTH_BYPASS=false` e `NODE_ENV=production`.
5. Reiniciar/publicar API e frontend. No VPS, as variáveis ficam no `deploy/vps/.env` (veja `deploy/vps/.env.example`).

Sem configuração, cadastro por senha e solicitação de links retornam indisponibilidade; não informam falsamente que enviaram um e-mail. Login de contas já existentes continua funcionando. Segredos nunca vão em variáveis `NEXT_PUBLIC`.

## Fluxos e contratos

- `POST /api/auth/register`: retorna `verificationRequired: true`, sem cookie de sessão. O portal pede confirmação por e-mail.
- `POST /api/auth/resend-verification` com `{email}`: resposta genérica `accepted: true`; permite novo envio após um minuto. Contas ausentes/verificadas não recebem mensagens.
- `POST /api/auth/verify-email` com `{token}`: confirmação explícita na tela do portal; link válido por 24 horas, de uso único.
- `POST /api/auth/forgot-password` com `{email}`: envia recuperação somente para contas ativas com senha; resposta genérica para contas ausentes ou Google sem senha. Permite novo envio após um minuto.
- `POST /api/auth/reset-password` com `{token,password}`: link válido por 30 minutos. Altera a senha, confirma a posse do e-mail, invalida os demais links e encerra todas as sessões. Exige novo login.

Os tokens ficam apenas como SHA-256 no banco e no fragmento do link (`#verify_token` / `#reset_token`), removido do endereço pelo portal. Abrir o link não consome o token: é necessário confirmar o formulário. As rotas públicas de autenticação mantêm CORS e limite de tentativas por IP; reenvio tem também limite transacional por conta. Falhas do provedor não expõem conteúdo ou credenciais e revertem a operação, permitindo tentar novamente. O envio é síncrono, com timeout de dez segundos; não há fila automática de entrega nesta implementação.

## Testes

`node --test services/api/auth-mail.test.mjs` testa configuração, links, entrega simulada e falhas sem enviar mensagens reais. `AUTH_TEST_DATABASE_URL=... node --test services/api/auth.integration.test.mjs` testa o ciclo em schema isolado, removido ao final. Use um banco de testes.

Para testar a interface localmente sem enviar e-mails, configure somente no ambiente local `AUTH_DEV_RESET_TOKENS=true`; o portal abre a confirmação ou recuperação com o token de demonstração. Essa opção é ignorada em produção.

Antes de ativar publicamente, homologar com caixa de e-mail de teste: recebimento e spam, confirmação, link expirado/reutilizado, reenvio, recuperação, senha antiga recusada e sessões anteriores encerradas. A chave, o domínio remetente e o recebimento real não são comprovados pelos testes simulados.

Contrato do provedor: https://resend.com/docs/api-reference/emails/send-email.
