# Convites e contas de aluno

As migrações 070 e 071 são aditivas. Contas existentes permanecem `educator`; novos alunos usam `account_type=student`, sem criar escola, assinatura ou permissão de professor. Login e confirmação de e-mail existentes são preservados.

## Autenticação

- `POST /api/auth/student/register`: `{displayName,email,password}` (mínimo de 10 caracteres). Retorna `verificationRequired:true`; confirme pelo link recebido e entre com o login existente. Não aceita `role`, CPF ou escola.
- `POST /api/auth/login`: no aplicativo, envie `x-client:mobile` para receber `data.token`.
- `GET /api/auth/me`: cookie `caderno_session` ou Bearer. Alunos retornam `role:student`, inclusive depois da aprovação. Antes da primeira aprovação não há instituição vinculada.
- `POST /api/auth/google/start`: `{accountType:"student"}`, sem CPF.
- `POST /api/auth/google/mobile/start`: `{tokenHash,accountType:"student"}`; protocolo de prova do dispositivo inalterado. O propósito fica guardado no servidor. Conta existente com senha não é vinculada automaticamente ao Google.

## Professor e gestor

Exigem sessão e membership de professor/coordenador/administrador na instituição da turma.

- `GET /api/classes/:classId/invite`: convite ativo ou null.
- `POST /api/classes/:classId/invite`: `{schoolId}` de escola cadastrada pelo responsável. Gera/renova código e invalida o anterior. Uma única escola pode ser selecionada pelo servidor.
- `DELETE /api/classes/:classId/invite`: desativa o convite.
- `GET /api/classes/:classId/join-requests`: pendências, nome, e-mail, data e cadastro já vinculado à conta, se houver.
- `GET /api/classes/:classId/join-candidates`: alunos ativos da turma ainda sem conta vinculada.
- `POST /api/class-join-requests/:requestId`: `{action:"reject"}` ou `{action:"approve",confirmed:true,studentId:"uuid"}`. Para criar cadastro: `{action:"approve",confirmed:true,studentName,registration}`. Respeita limite de alunos do plano. Conta já associada naquela instituição exige reutilização explícita do mesmo studentId.

Transações e bloqueios serializam aprovação e renovação. Segunda decisão recebe 409. Cadastro não pode pertencer a duas contas. Nenhuma associação automática por nome. Geração, renovação, desativação e decisões são registradas no audit_log.

## Aluno

Todos autenticados e restritos ao perfil student:

- `POST /api/class-invites/inspect`: `{code:"ABCD-EFGH"}`; escola, turma e professor, sem criar matrícula.
- `POST /api/class-invites/request`: `{code}`; cria pending. Repetição para a mesma conta/turma retorna 409, inclusive após rejeição. Não há reenvio automático nesta etapa.
- `GET /api/class-join-requests/me`: próprias solicitações e estados pending/approved/rejected.
- `GET /api/student/activities`: somente atividades das turmas aprovadas e vinculadas ao próprio cadastro ativo. Não retorna gabaritos, fotos ou respostas de colegas. Oculta pontuação enquanto houver revisão manual.

Código inválido/desativado: 404. Consulta e solicitação limitadas por usuário: 429. Mutação no navegador exige origem autorizada; aplicativo envia x-client:mobile e Bearer. Aluno não acessa gestão, catálogo, listas de colegas ou digitalização.

## Telas

Portal: Turmas → Convidar alunos. Escolha a escola, compartilhe código/link/QR Code; QR gerado localmente. A mesma tela lista pendências e exige confirmação explícita do cadastro escolhido.

Link: `/portal?invite=ABCD-EFGH`. Aluno entra na conta, confere os dados e solicita participação. Aplicativo: Sou aluno → Entrar em uma turma → código ou QR Code. Sessão de aluno separada dos dados offline do professor.

## Testes

`CLASS_INVITES_TEST_DATABASE_URL=... node --test services/api/class-invites.integration.test.mjs`

Use somente PostgreSQL descartável. Cobre confirmação, Google de aluno, permissões entre instituições, duplicação, renovação/desativação, decisões e geração concorrentes, reutilização e criação de cadastro, auditoria e isolamento de resultados. Todas as 71 migrações também foram aplicadas em banco descartável para verificar compatibilidade.
