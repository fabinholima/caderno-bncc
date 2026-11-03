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
- `GET /api/student/activities`: somente atividades das turmas aprovadas e vinculadas ao próprio cadastro ativo. Não retorna gabaritos, fotos ou respostas de colegas. Mostra apenas resultados autorizados pelo professor (`docs/resultados-publicacao.md`); antes disso a pontuação fica oculta.

Código inválido/desativado: 404. Consulta e solicitação limitadas por usuário: 429. Mutação no navegador exige origem autorizada; aplicativo envia x-client:mobile e Bearer. Aluno não acessa gestão, catálogo, listas de colegas ou digitalização.

## Código individual do aluno

Cada cadastro de aluno tem um código próprio (`students.access_code`, `UFA-` + 8 caracteres hexadecimais), mostrado ao professor na lista de alunos. Com ele, o aluno se vincula ao próprio cadastro na hora, sem aprovação do professor. A migração 102 torna `class_join_requests.invite_id` opcional e grava a origem do vínculo em `source` (`invite` ou `access_code`); vínculos por convite existentes continuam com `source='invite'`.

Aluno (somente `role=student`; mutação no navegador exige origem autorizada, o aplicativo envia `x-client:mobile` e Bearer):

- `POST /api/student/access-code/inspect`: `{code}`. Aceita maiúsculas ou minúsculas, com ou sem `UFA-`. Responde `{data:{studentName,schoolName,classes:[{className}]}}` com o cadastro ativo e as turmas em que está matriculado. Não grava nada.
- `POST /api/student/access-code/claim`: `{code}`. Numa transação, cria `student_account_links` (`linked_by` = a própria conta), a membership de aluno e uma solicitação `approved` com `source='access_code'` para cada turma matriculada (uma solicitação pendente por convite na mesma turma passa a aprovada). As turmas passam a aparecer em `GET /api/class-join-requests/me`, `GET /api/student/activities` e `GET /api/student/profile`. Responde `{data:{studentId,classes:[{className,schoolName}]}}`. Repetir com a mesma conta e o mesmo cadastro é idempotente (200). Registra `student_link.access_code` no audit_log quando algo muda.

Escola exibida quando o vínculo não veio de convite: escola da turma (`classes.school_id`), senão a do convite mais recente da turma, senão o nome da instituição.

Erros (mensagem em `error`): código inexistente, malformado ou de aluno inativo → 404; cadastro já ligado a outra conta, ou esta conta já ligada a outro cadastro na mesma instituição → 409; cadastro sem turma → 422; excesso de tentativas → 429 (mesmo limite por usuário dos convites, 30 tentativas em 15 minutos, somando consulta, vínculo e convites). Conta que não é de aluno recebe 403 (o aplicativo trata 403 como servidor sem estas rotas).

Professor e gestor:

- `GET /api/students`: cada aluno traz `linkedAccountName` e `linkedAccountEmail` (null quando não há conta vinculada).
- `DELETE /api/students/:studentId/account-link`: só professor, coordenador ou administrador da instituição do cadastro. Remove o vínculo, as solicitações daquela conta ligadas ao cadastro e a membership de aluno da conta naquela instituição; gera um novo `access_code` (o antigo deixa de valer). Responde `{data:{studentId,unlinked:true,accessCode}}`. Cadastro de outra instituição → 404; cadastro sem conta → 409. Registra `student_link.unlinked`.

Portal: Alunos cadastrados mostra a conta vinculada (nome e e-mail) e a ação "Desvincular conta", com confirmação.

## Telas

Portal: Turmas → Convidar alunos. Escolha a escola, compartilhe código/link/QR Code; QR gerado localmente. A mesma tela lista pendências e exige confirmação explícita do cadastro escolhido.

Link: `/portal?invite=ABCD-EFGH`. Aluno entra na conta, confere os dados e solicita participação. Aplicativo: Sou aluno → Entrar em uma turma → código ou QR Code. Sessão de aluno separada dos dados offline do professor.

## Testes

`CLASS_INVITES_TEST_DATABASE_URL=... node --test services/api/class-invites.integration.test.mjs services/api/student-access-code.integration.test.mjs`

Use somente PostgreSQL descartável. Cobre confirmação, Google de aluno, permissões entre instituições, duplicação, renovação/desativação, decisões e geração concorrentes, reutilização e criação de cadastro, auditoria e isolamento de resultados. O teste do código do aluno cobre consulta, vínculo, idempotência, 404/409/422/429, disputa simultânea pelo mesmo cadastro, conversão de solicitação pendente, isolamento entre instituições, atividades/perfil/solicitações após o vínculo e desvinculação com troca de código. Todas as 71 migrações também foram aplicadas em banco descartável para verificar compatibilidade.
