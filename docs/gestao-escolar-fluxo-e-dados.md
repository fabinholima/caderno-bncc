# Gestão escolar — primeira etapa: fluxo e dados

## Navegação

No menu **Gestão escolar**, o professor ou coordenador vê um caminho com cinco etapas: **Perfil → Escolas → Etapas → Turmas → Alunos**. O cabeçalho mostra o progresso e permite voltar às etapas já salvas. Cada tela tem uma ação principal e um atalho para continuar depois.

1. **Perfil (uma vez):** nome e telefone pessoal; escolha Professor(a) ou Coordenador(a). Professor seleciona disciplinas em chips. Coordenador seleciona etapas sob sua coordenação. Disciplinas e séries cursadas não são perguntadas aqui: passam a ser derivadas das turmas.
2. **Escolas:** busca pelo catálogo do INEP; selecionar abre os dados da fonte em modo de leitura. **Editar dados** libera os campos. **Cadastrar manualmente** abre formulário vazio. Cartões mostram escola, município/UF e qual está selecionada para o cabeçalho das provas. Ações: editar, definir cabeçalho e remover. Ao salvar, oferecer **Cadastrar turmas agora** e **Fazer depois**. Respeitar limite de seis escolas por usuário.
3. **Etapas:** escolher os níveis que a escola oferece. Depois, selecionar as séries/agrupamentos dentro de cada nível: Educação Infantil (Berçário, Maternal, Pré I, Pré II), Fundamental Anos Iniciais (1º–5º), Fundamental Anos Finais (6º–9º), Médio (1ª–3ª série), e opcionalmente EJA e Técnico. Os códigos são dados de catálogo, sem depender do texto de exibição.
4. **Turmas:** selecionar escola, etapa/ano, nome, turno, ano letivo e disciplinas que o usuário leciona naquela turma. Turmas são agrupadas por etapa e filtradas por ano. **Copiar turmas do ano anterior** cria rascunhos no ano novo sem duplicar alunos nem avaliações. Encerrar o ano arquiva a turma; promoção cria novas matrículas na série seguinte e preserva a turma/histórico anterior.
5. **Alunos:** selecionar turma e cadastrar individualmente, colar nomes (um por linha) ou importar planilha/CSV com prévia e modelo. Validar duplicidades na prévia, atribuir número de chamada, permitir edição em lote e transferência. Coletar apenas nome, número e matrícula opcional por padrão; data de nascimento e observação são opcionais e nunca aparecem em listas ou relatórios sem necessidade.

**Professor:** vê suas escolas, turmas e alunos próprios, além dos recursos institucionais para os quais tem vínculo. **Coordenador:** pode gerir as etapas e turmas autorizadas na instituição. O cadastro de perfil/escola não concede acesso ao banco compartilhado; convite de administrador continua obrigatório. Permissões de turma não ampliam acesso ao banco de questões.

**Estados vazios e atalhos:** sem escola, a tela de Turmas mostra “Cadastre uma escola para criar sua primeira turma” com botão **Cadastrar escola agora**. Sem etapas configuradas, mostrar **Configurar etapas**. Sem turmas, oferecer **Criar turma** e **Copiar do ano anterior** (desabilitado se não houver origem). Sem alunos, exibir os três métodos de cadastro. Se uma etapa não existir mais no currículo daquela escola, ela continua visível nas turmas antigas para preservar o histórico, mas não pode ser escolhida em nova turma.

## Modelo de dados aplicado ao projeto

O sistema já possui `users`, `educator_profiles`, `educator_schools`, `classes`, `students` e `class_enrollments`. Não se deve criar tabelas paralelas `usuarios`, `escolas`, `turmas` ou `alunos`: isso duplicaria identidades e quebraria os vínculos de provas, cartões-resposta, contas de aluno e relatórios. A migração aditiva `database/099_school_class_hierarchy.sql` cria `etapas_escola`, `class_subjects` e `class_memberships`, e acrescenta metadados opcionais às entidades existentes.

| Entidade lógica | Tabela real | Relação e finalidade |
| --- | --- | --- |
| Usuários | `users` | Tabela existente; identidade e autenticação. |
| Perfil | `educator_profiles` | Uma linha por usuário. Manter telefone e papel; disciplinas/anos legados viram resumo derivado das turmas. |
| Escolas | `educator_schools` | Pertencem ao usuário que as cadastrou; preserva logo e escola do cabeçalho. Limite de seis continua no serviço atual. |
| Etapas/anos da escola | `etapas_escola` | Muitas opções por escola; unicidade por escola, etapa e agrupamento. |
| Turmas | `classes` | Continua ligada à instituição e às provas existentes; passa a referenciar escola, etapa, turno e criador. |
| Disciplinas por professor/turma | `class_subjects` | Relação N:N entre professor, turma e disciplina. |
| Permissões de turma | `class_memberships` | Usuários autorizados; dono, professor e coordenador. Não substitui a autorização institucional. |
| Alunos | `students` | Mantém identidade, conta, status e vínculos atuais; matrícula fica opcional; acrescenta nascimento e observação mínima. |
| Matrículas | `class_enrollments` | Relação N:N histórica aluno–turma e número de chamada, já existente. Transferir cria nova matrícula sem apagar respostas antigas. |

Chaves importantes: `etapas_escola.school_id → educator_schools.id`; `classes.school_id → educator_schools.id`; `classes.school_stage_id → etapas_escola.id`; `class_subjects.class_id → classes.id` e `teacher_id → users.id`; `class_memberships.class_id → classes.id` e `user_id → users.id`; `class_enrollments` mantém as FKs atuais. Índices atendem escola/ano, criador/ano, escola/etapa, usuário/permissões e matrícula única não vazia por instituição.

## Privacidade e migração sem perda

Dados de alunos já ficam sob `institution_id`; `teacher_id` identifica quem cadastrou. As novas rotas devem conferir instituição e `class_memberships` antes de ler, editar, exportar ou excluir; coordenadores só acessam turmas conforme a permissão institucional existente. Não registrar observações detalhadas de saúde: usar texto curto de necessidade pedagógica (por exemplo, “prova ampliada”), justificar o uso e restringir à equipe autorizada. A tela precisa informar a finalidade, oferecer exclusão e não tornar data de nascimento obrigatória.

A migração adiciona colunas nullable/default e tabelas; não apaga linhas existentes. Turmas antigas ficam sem escola/etapa até o usuário as vincular, e continuam operando com `grade` e `school_year`. Matrículas, alunos, aplicações, notas e respostas não são copiadas nem removidas. Os arrays antigos do perfil podem ser lidos enquanto a tela nova entra em operação; depois de haver turmas, o serviço passa a calcular disciplinas/séries a partir delas. Executar primeiro em staging e conferir contagens de `educator_schools`, `classes`, `students`, `class_enrollments` e `assessment_applications` antes/depois.

### Aplicar a migração em desenvolvimento

```bash
pnpm --filter @caderno/api migrate
```

Esta etapa não altera dados do servidor de produção. A API e as telas novas devem ser implantadas depois que a migração tiver sido revisada e aplicada no ambiente correspondente.
