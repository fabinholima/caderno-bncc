# Gestão Acadêmica

Módulo de continuidade acadêmica do UFA Prova: anos letivos, matrículas com
histórico, eventos acadêmicos e vínculos com período. Implementado em fases.

## Decisão de arquitetura (Caminho A)

A tabela `institutions` continua sendo o escopo de dados e de cobrança. Uma
conta individual de professor é uma "instituição de um professor"; uma escola
com vários professores usa a mesma instituição, com `memberships`
(`admin`, `coordinator`, `teacher`, `student`). O aluno continua sem
assinatura. Escolas compartilhadas com cobrança própria ficam para depois.

## Fase 1 (migração `111_academic_years_enrollment_history.sql`)

| Tabela / coluna                                                | Papel                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic_years`                                               | Ano letivo por instituição (`UNIQUE(institution_id, year)`), status `planning`, `active`, `closing`, `closed`, `archived`.                        |
| `classes.academic_year_id`, `classes.status`                   | Toda turma pertence a um ano letivo. `school_year` é mantido para compatibilidade e sincronizado por trigger.                                     |
| `student_enrollments`                                          | Matrícula histórica: turma, ano, série, nº de chamada, status, situação acadêmica, entrada e saída. Guarda o retrato do nome e da série da turma. |
| `academic_events`                                              | Linha do tempo imutável (matrícula criada/encerrada, mudanças de ano letivo; promoção, transferência e reversão nas próximas fases).              |
| `memberships.status/start_date/end_date/revoked_at/revoked_by` | Vínculo com período. O controle de acesso por status entra na fase 4.                                                                             |
| `audit_log.before_data/after_data/reason`                      | Auditoria com antes/depois e motivo.                                                                                                              |

### Regras garantidas no banco

- `class_enrollments` continua sendo a lista operacional da turma (cartões,
  mobile, aplicações e relatórios não mudaram). Triggers mantêm
  `student_enrollments`: incluir na turma abre uma matrícula; tirar da turma
  **encerra** a matrícula (`cancelled`, `completed`, `transferred` ou `dropped`
  conforme a situação), nunca apaga.
- Uma matrícula ativa por aluno em cada turma (índice único parcial).
- Matrícula histórica não pode ser excluída; aluno, instituição, ano e data de
  entrada são imutáveis; matrícula encerrada não volta a ficar ativa por
  UPDATE direto.
- Eventos acadêmicos não podem ser alterados nem excluídos.
- Turma com matrícula ou prova não muda de ano letivo (não é reutilizada).
- Ano letivo `closed`/`archived` não aceita turmas nem matrículas novas.
- FKs novas usam `ON DELETE RESTRICT` e chaves compostas
  `(institution_id, academic_year_id)` impedem misturar instituições.
- Aluno com histórico não pode ser excluído (FK `RESTRICT`).

Limpeza de dados de teste ou suporte, somente dentro de uma transação:

```sql
BEGIN;
SET LOCAL ufaprova.allow_history_purge = 'on';
-- exclusões
COMMIT;
```

### Preenchimento dos dados existentes

- Um `academic_year` por par (instituição, `school_year`) já usado, com status
  `active`. Nenhum ano é encerrado automaticamente.
- Uma matrícula ativa para cada linha de `class_enrollments`, com data de
  entrada igual à criação da turma.
- Turmas com `archived_at` recebem `status = 'archived'`.
- A migração termina com uma validação que **aborta tudo** (a migração roda em
  uma transação) se houver turma sem ano letivo ou matrícula sem histórico.

## API

Todas exigem sessão de equipe (aluno recebe 403). Os dados são sempre
filtrados pela instituição ativa da sessão; recurso de outra instituição
responde 404.

| Método | Rota                        | Quem                                        | Descrição                                                                                              |
| ------ | --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/api/academic-years`       | equipe                                      | Anos letivos com número de turmas e matrículas ativas.                                                 |
| POST   | `/api/academic-years`       | admin, coordenação                          | `{ year, startDate?, endDate? }`. Cria em `planning`. 409 se já existir.                               |
| PATCH  | `/api/academic-years/:id`   | admin, coordenação                          | `{ startDate?, endDate?, status?: 'planning'\|'active', reason? }`. Encerrado ou em encerramento: 409. |
| GET    | `/api/students/:id/history` | equipe; professor só alunos das suas turmas | Matrículas (ativas e encerradas) e eventos com o responsável.                                          |

`POST /api/classes/:id/enrollments` agora registra o responsável pela
matrícula e responde 409 quando o ano letivo está encerrado.

## Implantação

1. Backup antes da migração (ver `docs/backup-producao.md`).
2. Aplicar em homologação com `node services/api/migrate.mjs` e conferir:

   ```sql
   SELECT count(*) FROM classes WHERE academic_year_id IS NULL;      -- 0
   SELECT (SELECT count(*) FROM class_enrollments) AS roster,
          (SELECT count(*) FROM student_enrollments WHERE status='active') AS historico; -- iguais
   SELECT institution_id, year, status FROM academic_years ORDER BY 1, 2;
   ```

3. Repetir em produção. Reversão: restaurar o backup (a migração não altera
   nem apaga dados existentes; só acrescenta tabelas, colunas e triggers).

## Testes

`services/api/academic-years.integration.test.mjs`, contra um banco com todas
as migrações:

```bash
ACADEMIC_TEST_DATABASE_URL=postgresql://... node --test services/api/academic-years.integration.test.mjs
```

## Próximas fases

2. Encerramento e reabertura excepcional do ano letivo (pendências, bloqueio
   de resultados).
3. Progressão em lote, retenção, conclusão, transferência e reversão.
4. Vínculos de professores com acesso revogável e substituição em turmas.
5. Telas de Gestão Acadêmica, histórico do aluno e painel.

## Permissões de exclusão do administrador

Quem tem a permissão: qualquer conta com papel `admin` na instituição ativa
(inclui o professor de conta individual, que é admin da própria instituição)
e a administração do portal (`portal_admin`). Regra em
`canPurgeAcademicRecords` (`services/api/institution-permissions.mjs`).
Professor e coordenação seguem as regras que preservam o histórico.

| Ação                   | Professor / coordenação                                                                    | Administrador                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Excluir prova          | Só as próprias, sem respostas; aplicações agendadas ou canceladas podem ser desvinculadas. | Qualquer prova da instituição com `DELETE /api/assessments/:id?purge=true`: apaga aplicações, cartões-resposta, respostas, notas (versões, publicações, alterações, acompanhamentos) e relatórios. Turma, alunos e histórico de matrícula ficam. |
| Remover cartão da fila | Só cartões com erro ou em revisão sem aluno identificado.                                  | Qualquer cartão, menos os que estão em leitura. Se o cartão já gerou nota, a nota do aluno é apagada (inclusive a publicada) e o cartão pode ser reenviado. O cartão fica como `discarded`, com quem descartou, para auditoria.                  |

As duas ações do administrador ficam no `audit_log` (`assessment.purge` com
título e contagens; `card_scan.discard_admin` com o estado anterior). A
exclusão total de prova é irreversível fora do backup; as imagens dos cartões
são removidas do storage depois do COMMIT. Relatórios e contagens de
corrigidos ignoram cartões descartados.
