# Importação em lote por texto, TXT ou Markdown

No portal, em Importar provas, escolha **Lote por texto / TXT / Markdown**. Preencha os dados da fonte, carregue um arquivo UTF-8 `.txt`, `.md` ou `.markdown` (até 2 MB) ou cole seu conteúdo (até 1 milhão de caracteres). Cada lote admite até 100 questões. Use o botão de exemplo para consultar o formato.

Cada questão começa em uma linha própria `QUESTÃO 1`, `QUESTÃO 2` etc. Markdown aceita também `## QUESTÃO 1`. Não repita números no mesmo lote. Enunciados precisam ter ao menos 20 caracteres. Alternativas devem começar em linhas próprias; `(A)`, `(a)`, `A)`, `a)` e `A.` são aceitos. Questões de resposta única precisam de A–E no cadastro, conforme a regra atual do portal.

`HABILIDADE: EM13CNT101` (ou `HABILIDADE BNCC: EM13CNT101`) preenche a habilidade individual da questão. O campo é opcional e deve estar em linha própria, antes da resolução; também aceita `**HABILIDADE:**` no Markdown. O servidor valida o formato e a existência no catálogo da instituição, respeitando a disciplina quando a prova é de disciplina única. Código inválido, desconhecido ou incompatível impede a importação do lote e indica a questão para correção. Não há criação automática de habilidades. Sem o campo, continua valendo a classificação manual ou o padrão do lote.

`DISCIPLINA:`, `SÉRIE:`, `TÓPICO:` e `SUBTÓPICO:` (e `DETALHAMENTO:`, para o terceiro nível) classificam a questão pelo catálogo de Planejamento. São opcionais, ficam em linhas próprias antes da resolução e aceitam `**CAMPO:**` no Markdown. A série aceita `2ª série`, `2º ano` ou `2`. O servidor procura os nomes, sem diferenciar maiúsculas ou acentos, entre as disciplinas do Ensino Médio e os tópicos ativos da instituição: o tópico precisa ser um objeto da disciplina (e da série, quando informada), e o subtópico, um filho desse tópico. A questão recebe a disciplina, a série e o nível mais específico informado; sem `SÉRIE:`, vale a série do tópico. Em prova de disciplina única, `DISCIPLINA:` pode ser omitida e, se informada, precisa ser a da prova. Nome desconhecido, tópico fora do nível esperado ou tópico presente em mais de uma série sem `SÉRIE:` impedem a importação do lote e indicam a questão. Nada é criado automaticamente. A habilidade também é conferida contra a disciplina da questão. Na colagem de questão única, esses campos são ignorados e a classificação continua no formulário.

```text
QUESTÃO 1
DISCIPLINA: Química
SÉRIE: 2ª série
TÓPICO: Estequiometria
SUBTÓPICO: Cálculo estequiométrico
HABILIDADE: EM13CNT301
Enunciado da questão...
```

`GABARITO: C` é opcional. Para respostas múltiplas, use `GABARITO: A, C`. `RESOLUÇÃO:` inicia uma resolução opcional em ConTeXt puro. `NOTE E ADOTE:` separa uma observação opcional. `FIM DA QUESTÃO` pode encerrar o conteúdo. A resolução deve ser a última seção. Não cole títulos ou introduções antes da primeira questão.

```text
QUESTÃO 1
Calcule a área de um quadrado de lado 3 cm.
(A) 3
(B) 6
(C) 9
(D) 12
(E) 15
GABARITO: C
RESOLUÇÃO:
\startformula
A = l^2 = 3^2 = 9
\stopformula
FIM DA QUESTÃO
```

O conteúdo é preservado, incluindo `\startMPcode`, `btex ... etex` e fórmulas. Marcadores dentro de blocos ConTeXt não separam questões. Blocos abertos ou incompatíveis, alternativas repetidas e gabarito que aponta para alternativa ausente são rejeitados. O importador não converte LaTeX automaticamente neste fluxo e não chama APIs de IA.

Ao criar a importação, todos os itens são salvos para revisão, sem cadastrar questões no banco público. Confira cada texto, marque “Revisei o enunciado, as alternativas e a resolução desta questão” e confirme os gabaritos sugeridos. Alterar enunciado ou resolução desmarca a revisão. Sem gabarito, a questão objetiva permanece pendente. Classifique série e tópico, usando os padrões do lote quando apropriado. A resolução pode ser editada por questão; use **Editar, gerar prévia e cadastrar** para conferir a prévia de questão e de gabarito comentado. No cadastro em lote, a resolução acompanha cada questão. Discursivas exigem resolução/resposta esperada. As permissões editoriais existentes são mantidas.

A resolução é armazenada no campo existente de explicação da questão; não é incluída na prova do aluno. Não há migração de banco nesta alteração.

## API

`POST /api/exam-imports`, autenticado, mantém os campos de fonte e recebe `pastedText` no lugar dos documentos/URLs. Não misture texto e PDF na mesma requisição. O servidor faz a separação novamente; falhas de formato retornam 422 e nenhum lote parcial é gravado. As questões ficam em `extracted_candidates` com `resolution`, `adoteNote`, `extractionMethod: "pasted-text"` e `answerStatus: "suggested"` ou `"missing"`.

`PATCH /api/exam-imports/:id/candidates/:candidateId` aceita `resolution` (até 20 mil caracteres) e `adoteNote` (até 8 mil), além dos campos já existentes. O cadastro final continua usando `POST /api/questions` com `answerGuide`/`answerBlocks` para a resolução.
