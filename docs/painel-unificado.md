# Painel único e perfis

Administrador geral e editor são permissões de conta (`users.portal_admin` e `users.portal_editor`), nunca atribuídas pelo formulário de cadastro ou convite institucional. Professor é o perfil padrão do portal, mesmo quando responsável pelo próprio espaço institucional.

Questões, importações e catálogo curricular utilizam a instituição configurada em `portal_settings.question_bank_id`. O navegador não escolhe essa instituição. Não existe mais alternância entre banco geral e espaço pessoal. As sessões antigas também recebem o contexto unificado ao atualizar.

Professores consultam o catálogo e geram provas; editores e administradores também cadastram, editam e importam questões. A API bloqueia mutações do catálogo para professores, independentemente da interface. O administrador configura editores por e-mail em Configurações → Permissões do portal; concessões e revogações são auditadas. Não é possível conceder administração geral por esse formulário.

Avaliações, alunos, turmas, assinaturas e escolas mantêm o escopo institucional anterior. A montagem de avaliações aceita questões da própria instituição ou do banco geral, mas grava a prova na instituição do usuário. O administrador não recebe acesso indiscriminado aos alunos de outras instituições. Limites de assinatura continuam aplicáveis à geração de provas.

A migração 046 deve ser aplicada antes de iniciar a API atualizada. As funções de alternância do módulo antigo permanecem apenas para compatibilidade de testes históricos; o endpoint público de alternância retorna 410 e não altera mais a sessão.
