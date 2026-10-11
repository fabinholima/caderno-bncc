# Rascunhos do editor de questões

Migração: `075_question_editor_drafts.sql`. Os rascunhos incompletos ficam em tabela própria, sem aparecer no acervo ou nas avaliações antes do cadastro completo.

Ao editar, o portal salva automaticamente após uma breve pausa na digitação e mostra `Alterações pendentes`, `Salvando` ou o horário confirmado pelo servidor. `Salvar rascunho` grava imediatamente sem validar campos obrigatórios nem exigir PDF. Ao fechar o editor, o portal tenta salvar e mantém o formulário aberto se não conseguir. O navegador avisa ao sair com alterações pendentes; não se promete salvamento durante o fechamento abrupto da aba.

Na nova questão, escolha um item em `Rascunhos salvos` e clique `Retomar`. São preservados conteúdo rico, fórmulas, imagens, alternativas, gabarito e classificação. A prévia PDF precisa ser gerada novamente quando exigida para uma importação. `Cadastrar questão` continua validando o conteúdo completo; os erros ficam visíveis dentro do editor.

Rascunhos pertencem ao usuário e ao contexto institucional. Apenas editores e administradores reais acessam as rotas. GET não usa cache; POST exige origem autorizada. Versões previnem sobrescritas entre abas, e retries idênticos após perda de resposta são idempotentes. Limites: 8 MB por rascunho e 50 abertos por proprietário/contexto. `Descartar rascunho` encerra o item sem apagar uma questão do acervo. Após cadastro completo, o rascunho é encerrado.

Rotas: `GET /api/questions/drafts`, `GET|POST /api/questions/drafts/:id`, `POST /api/questions/drafts/:id/complete`.

Testes: `node --test services/api/question-drafts.test.mjs`. Integração com schema isolado: `QUESTION_DRAFT_TEST_DATABASE_URL=... node --test services/api/question-drafts.integration.test.mjs`. Usar banco de testes.
