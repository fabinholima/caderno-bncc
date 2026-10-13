# Prévia da resolução

No banco de questões, o botão de visualização abre a opção **Questão** e permite alternar para **Resolução e gabarito**. Quando não existe resolução cadastrada, a segunda opção fica desabilitada e a tela informa o motivo.

No formulário de cadastro e edição, **Prévia da resolução** compila o conteúdo atual do campo de resolução, antes de salvá-lo. O PDF inclui o gabarito e os comentários ou critérios de correção. A prévia da questão continua separada e não incorpora a resolução ao documento do aluno.

O endpoint `POST /api/questions/preview` aceita `previewMode: student` (padrão) ou `answer-key`. O modo faz parte da chave de cache. A resolução usa a mesma composição ConTeXt do gabarito da prova e materializa suas imagens e fórmulas; erros do compilador aparecem no log da prévia. O modo de resolução exige o gabarito real e não marca alternativas automaticamente.

Gerar a prévia da resolução não substitui a conferência da prévia da questão para cadastrar uma questão importada. A visualização não altera nem aprova o conteúdo e não exige migração de banco de dados.
