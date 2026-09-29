# Cadastro, login e CPF

## Local

Abrir `/portal` para cadastro com e-mail/senha ou login. O bypass de desenvolvimento deve ficar desativado. Senhas usam scrypt com salt, sessões usam cookie HttpOnly/SameSite e são revogadas ao sair. Em produção, NODE_ENV=production ativa Secure; usar frontend e API no mesmo site (por exemplo app.exemplo.com e api.exemplo.com), HTTPS e CORS_ORIGIN explícito.

Aplicar migrações 042 e 043 após 041 antes de reiniciar a API.

## CPF

CPF obrigatório para novos cadastros; contas antigas completam o CPF após login antes de acessar as APIs do portal. Formato e dígitos verificadores são validados. Índice UNIQUE no PostgreSQL impede duplicações concorrentes, inclusive entre Google e senha. Nunca unir contas automaticamente pelo CPF ou e-mail.

Guardar no ambiente do backend uma CPF_HASH_SECRET aleatória com pelo menos 32 caracteres. O banco armazena somente HMAC-SHA256 do CPF normalizado, não o número original. A chave deve ser a mesma em todas as instâncias e computadores e deve ter backup privado separado do Git e do dump do banco. Não substituir a chave com dados cadastrados: isso quebraria a comparação de duplicados. O hash ainda é um identificador pessoal; limitar acesso e retenção. Não registrar corpos de requisição de autenticação no proxy/logs.

A validação não consulta a Receita Federal nem comprova titularidade. CPF de terceiros ainda pode ser informado. Casos de CPF já utilizado exigem recuperação da conta/suporte com verificação de identidade, não liberação automática.

## Google Cloud

1. Criar/configurar projeto, tela de consentimento e cliente OAuth do tipo Aplicativo da Web.
2. Registrar URI de redirecionamento EXATA: local `http://localhost:8788/api/auth/google/callback`; produção `https://SUA-API/api/auth/google/callback`.
3. No backend configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI e AUTH_FRONTEND_URL (local `http://localhost:3000`). Não expor client secret no frontend/Git.
4. Em modo de teste no Google, adicionar usuários de teste e validar a autorização real. Configurar domínio/tela de consentimento para produção conforme requisitos da conta.

O fluxo usa authorization code com PKCE, estado aleatório de uso único no PostgreSQL, vínculo ao navegador por cookie HttpOnly e validade de 10 minutos. O backend troca o código e consulta o endpoint UserInfo do Google usando o token obtido diretamente. Não decodifica JWT sem validação nem aceita perfil enviado pelo navegador; não armazena tokens Google. Escopos: openid, email e profile (não Gmail/Drive).

Primeiro cadastro com Google: escolher Criar conta e informar CPF, depois Continuar com Google. O espaço pessoal e período de sete dias são criados uma única vez. Login seguinte identifica pelo subject imutável do Google. Para contas antigas de senha com o mesmo e-mail, a associação é recusada; não há vinculação de contas neste primeiro módulo.

## Limites antes de produção

- Recuperação por e-mail ainda sem serviço de envio: desativada e sem promessa de e-mail enviado. AUTH_DEV_RESET_TOKENS=true expõe token somente para testes locais; nunca habilitar em ambiente acessível ao público.
- Cadastro por senha ainda não confirma posse do e-mail. Planejar envio/verificação de e-mail antes do lançamento.
- Limite local de 30 tentativas por IP a cada 15 minutos nos endpoints de login/cadastro. Em múltiplas instâncias usar limitador compartilhado/reverse proxy confiável; não confiar em X-Forwarded-For fornecido pelo cliente.
- Finalizar política de privacidade, suporte de recuperação e homologação Google antes da publicação. Nenhum CPF ou segredo deve ser incluído nos testes, logs ou commits; exemplos de teste não representam titular identificado.
