# Administrador do portal

A migração 045 adiciona users.portal_admin (false por padrão) e um banco editorial separado. Registro, Google e convites nunca atribuem essa permissão. Não existe endpoint público para promovê-la; concessão e revogação são operações administrativas no banco, para usuário existente e ativo, com registro em audit_log.

O botão Administrar banco geral troca o contexto da sessão, não as memberships do usuário. Banco geral permite apenas questões, importações e catálogo curricular. Não permite convidar terceiros, consultar alunos de escolas, gerenciar pagamentos ou criar avaliações nesse contexto. Voltar ao meu espaço restaura o contexto pessoal.

O banco editorial possui plano interno para suportar a fila de importação, sem cobrança comercial. Nenhuma questão ou escola pessoal é copiada automaticamente. O catálogo pedagógico institucional do banco geral pode ser organizado em Planejamento. Aprovação de questões usa o fluxo existente; distribuição do banco geral para consumo por assinantes ainda é uma etapa separada.

GET /api/auth/me retorna portalAdmin e globalBank. POST /api/admin/bank-context exige sessão real, permissão global e Origin autorizado. A permissão é relida a cada requisição; revogação deixa de resolver o contexto global imediatamente. DEV_AUTH_BYPASS nunca recebe o papel global.

A identidade institucional admin continua significando responsável pelo próprio espaço; não equivale a portal_admin. Não conceder portal_admin baseado apenas no endereço enviado pelo navegador ou em domínio de e-mail. O administrador geral autentica normalmente, entra no banco geral em novas sessões e não precisa cadastrar escola, CPF ou perfil docente. Essa dispensa não se aplica a professores ou administradores de escolas.

## Recuperação local

O formulário aceita links `/portal#reset_token=...`, remove o token da barra de endereço e permite definir nova senha. O token é de uso único, expira em 30 minutos e a troca encerra as sessões existentes. O operador autorizado pode gerar o link com `node --env-file=.env services/api/create-recovery-link.mjs EMAIL`. Trate o link como senha; não inclua em logs compartilhados ou Git. O banco guarda apenas seu hash. O envio automático por e-mail ainda exige configuração; o botão Esqueci minha senha informa essa limitação, sem simular envio. Não habilitar AUTH_DEV_RESET_TOKENS em ambientes acessíveis a terceiros.
