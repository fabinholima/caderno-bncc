# Manutenção do portal

Aplique a migração `068_portal_maintenance.sql` antes de publicar a API e o frontend. O modo inicia desativado.

No painel do administrador geral, abra **Configurações → Manutenção do portal**, marque **Ativar modo de manutenção**, escreva a mensagem e salve. Para liberar o portal, desmarque e salve. Alterações ficam registradas na auditoria.

Visitantes e professores veem a página de manutenção; a API responde 503 com `Retry-After: 300` para operações do portal. Somente administradores gerais com sessão real continuam usando o painel. Administradores de instituições e o bypass de desenvolvimento não têm essa exceção.

O link **Acesso do administrador** permite entrar para desativar a manutenção. Login, recuperação de senha, callbacks de pagamento e health continuam disponíveis. As páginas de privacidade e contato permanecem acessíveis. Páginas abertas consultam o estado a cada 15 segundos. Trabalhos de geração/importação já enfileirados não são interrompidos.

Rotas: `GET /api/maintenance` (pública, sem cache), `GET /api/admin/maintenance` e `POST /api/admin/maintenance` (administrador geral, POST exige origem autorizada).

Validação: `node --test services/api/maintenance.test.mjs`, `tsc --noEmit` e `vinext build`. Para homologação com banco, ative com administrador, confira uma sessão de professor e um visitante, depois desative usando o acesso administrativo.
