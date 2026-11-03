# Relatório de entrega: módulos Professor e Aluno

Repositórios e branches (ainda sem push):

- API e worker: `caderno-bncc-atualizado`, branch `feat/pwa-subdominios`, sobre `feat/publicacao-resultados`.
- Aplicativo e PWA: `ufaprova-mobile`, branch `feat/pwa-subdominios`, sobre `feat/publicacao-resultados`.

Nada foi publicado, migrado em produção ou contratado.

## O que foi implementado

| Área | Implementação |
|---|---|
| Um app, dois perfis | O mesmo código Expo gera o app nativo e a PWA. `professor.ufaprova.com.br` e `aluno.ufaprova.com.br` são só entradas; a autorização é da API. Uma conta de aluno na entrada do professor é levada à área do aluno, já conectada. |
| Aluno gratuito | Cadastro, vínculo e consulta não passam pela assinatura. Com a assinatura inativa, o aluno mantém o histórico publicado e só novos envios de fotos ficam bloqueados (402), sem perder a captura na fila. |
| Seleção da avaliação | A lista mostra disciplina, turma, alunos, número de questões e versões do gabarito. Gabarito incompleto bloqueia a captura no app e no servidor (422). |
| Captura | Câmera ou galeria. Fila offline com reenvio idempotente: o mesmo ID não gera outro registro. Foto desfocada ou escura vai para revisão, com orientação de nova foto. |
| Correção OMR | Resultados possíveis: correta, incorreta, em branco, múltipla, duvidosa. A leitura duvidosa nunca é adivinhada. Acertos, erros, em branco e inválidas são contados separadamente. A nota só sai quando não há pendência. |
| Revisão e autorização | O resultado nasce provisório (`assessment_result_versions`). A publicação ao aluno exige autorização, individual ou em lote, da versão conferida. Ficam registrados quem autorizou, quando e qual versão. Mudança posterior pede nova autorização. |
| Anulações e regras | Questão anulada exige política (excluir ou pontuação integral) e recalcula a aplicação. |
| Baixo rendimento | O mínimo esperado vem da aplicação, da escola/disciplina, da escola, da disciplina ou da instituição. Motivos e ações são escolhidos pelo professor; o sistema não sugere causa. A observação interna fica separada da orientação ao aluno. O histórico não apaga entradas e não bloqueia a publicação. |
| Área do aluno | Notas por disciplina, histórico, evolução e orientação publicada. As questões aparecem conforme a política de liberação (resumo, respostas, respostas e gabarito). Sem ranking. |
| BNCC | Desempenho por habilidade a partir dos vínculos existentes, com o número de questões. Abaixo de 3 questões, o indicador avisa que a evidência é insuficiente. Nenhum código é inventado. |
| Recuperação de acesso | "Esqueci minha senha" no app do professor e do aluno; a nova senha é definida pelo link do e-mail. |
| PWA | Manifest, ícones e instalação. Sessão no cookie HttpOnly da API, sem token no navegador. Dados da escola só na memória da aba. O service worker guarda apenas os arquivos públicos do site. |

## Critérios de aceite

| Critério | Situação | Como foi verificado |
|---|---|---|
| Um único aplicativo com os perfis Professor e Aluno | Atendido | Testes do App; navegador local |
| Subdomínios direcionam às áreas da mesma aplicação | Atendido no código | `tests/web.test.cjs`; navegador local com `?perfil=`. Falta configurar DNS e o site |
| Aluno cadastra-se sem assinatura ou pagamento | Atendido | Testes de cadastro de aluno; nenhuma tela comercial na área do aluno |
| Vínculo por QR Code ou código | Atendido (fases anteriores) | `class-invites.integration.test.mjs`, `StudentScreen.test.cjs` |
| Matrículas existentes associadas sem duplicação | Atendido | Código pessoal do aluno; `student-access-code.integration.test.mjs` |
| Professor envia fotos e executa a correção | Atendido | `mobile-sync.integration.test.mjs` com o worker OMR real |
| Marcações duvidosas exigem revisão antes da publicação | Atendido | `assessment-results.test.mjs`, `result-authorization.integration.test.mjs` |
| Lançamento depende da autorização do professor | Atendido | `result-authorization.integration.test.mjs` |
| Resultados provisórios invisíveis ao aluno | Atendido | Mesmos testes: o aluno só lê versões publicadas |
| Aluno consulta resultados por disciplina | Atendido | `student-grades.test.cjs` |
| Baixo rendimento com justificativas e ações | Atendido | Testes da API e `ResultsScreen.test.cjs` |
| Reenvios não criam notas duplicadas | Atendido | Recibos idempotentes, uma versão por leitura idêntica, autorização repetida sem novo lançamento |
| Histórico disponível com assinatura inativa | Atendido | `mobile-sync` e testes de publicação |
| Isolamento entre usuários, turmas e escolas | Parcial | Entre instituições e entre alunos: testado. Entre turmas da mesma instituição: ainda não, veja Pendências |
| Fluxos principais no celular | Atendido no navegador | Largura de 375 px no navegador local. Falta conferir em aparelho físico |

Última execução: API 279 aprovados e 1 ignorado; OMR 5 (Node) e 7 (Python) aprovados; app 89 aprovados; typecheck, lint e build web sem erros.

## Endpoints adicionados

Contratos em `docs/resultados-publicacao.md`, `docs/class-invites-api.md` e `docs/pwa-subdominios.md`.

- Professor:
  - `GET /api/assessment-applications/:id/results`
  - `GET` e `PUT /api/assessment-applications/:id/result-settings`
  - `POST /api/assessment-results/authorize`
  - `GET /api/assessment-results/:id`
  - `GET` e `POST /api/assessment-results/:id/followups`
- Aluno:
  - `GET /api/student/results/:id`
  - `GET /api/student/skill-performance`
- Navegador: `POST /api/auth/session/cookie`.
- Campos aditivos em:
  - `GET /api/assessment-applications`: disciplina, versões, gabarito;
  - leitura de cartões: resultado, publicação, duplicidade, qualidade da foto;
  - `GET /api/student/activities`: resultado publicado.

## Variáveis de ambiente

| Onde | Variável | Uso |
|---|---|---|
| API | `CORS_ORIGIN`, `AUTH_FRONTEND_URL` | Origens aceitas. Em produção, os domínios oficiais e os dois subdomínios entram sempre |
| API | `NODE_ENV=production` | Cookie `SameSite=None; Secure` |
| API (testes) | `*_TEST_DATABASE_URL`, incluindo `RESULT_PUBLICATION_TEST_DATABASE_URL` | Testes de integração (`.github/workflows/ci.yml`) |
| App/PWA | `EXPO_PUBLIC_API_URL` | Endereço da API |
| App/PWA | `EXPO_PUBLIC_PORTAL_URL` | Portal (e origens aceitas nos convites) |
| PWA | `EXPO_PUBLIC_TEACHER_URL`, `EXPO_PUBLIC_STUDENT_URL` | Destino da troca de área |

Desenvolvimento: `.env.example` do app. Produção: variáveis do Render (`render.yaml` do app).

## Implantação (ordem)

1. No VPS, rodar `deploy/atualizar-producao.sh` (veja `docs/atualizacao-producao.md`). Ele faz o backup do banco, atualiza a API e o worker OMR e confere `/health`. A API aplica `103_result_publication.sql`, a única migração nova, ao iniciar. Ela não é destrutiva: converte em "publicado (legado)" o que o aluno já via.
2. O novo worker OMR converte em legado, sozinho, o que a versão antiga concluir durante a troca (ao iniciar e após 5 e 30 minutos). O script `backfill-legacy-results.mjs` fica para uma execução manual, se necessário.
3. Criar o site estático `ufaprova-pwa` pelo `render.yaml` do app e adicionar os domínios `professor.` e `aluno.`. Depois, criar os CNAMEs no DNS.
4. App nativo: gerar nova compilação. `expo-image-picker` é módulo nativo novo; a versão do Expo Go ou do build atual não o contém.

## Pendências e decisões externas

- **Configuração externa:** DNS dos subdomínios, criação do site estático, domínio da API e nova compilação do app nativo. Também falta conferir em aparelhos físicos: câmera no navegador, instalação da PWA no Android/iOS e entrada Google pela web.
- **Permissão por turma:** hoje o acesso do professor é por instituição e papel. A tabela `class_memberships` existe, mas as rotas ainda não a aplicam. Restringir por turma exige popular os vínculos das turmas existentes; recomendo decidir isso antes de abrir para várias equipes na mesma instituição.
- **Retenção das imagens:** não há regra de exclusão das fotos dos cartões. Defina o prazo (por exemplo, até o fim do ano letivo seguinte) e quem pode pedir exclusão antecipada. A rotina pode ser implementada depois, com a definição em mãos.
- **Mesma pessoa com os dois perfis:** professor e aluno são contas diferentes no modelo atual. A troca de área funciona entre as entradas, mas cada área usa sua conta.
- **Limitações menores:**
  - não há botão para descartar um cartão duplicado (a decisão é tomada na revisão);
  - cartões enviados de outro aparelho são revisados no portal;
  - a nota usa a soma de pontos do snapshot, e o percentual conta acertos.
