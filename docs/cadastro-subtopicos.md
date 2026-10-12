# Cadastro de subtópicos institucionais

No Planejamento do Ensino Médio, selecione disciplina, série e nível superior. Um objeto aceita subtópicos; um subtópico aceita detalhamentos. Não há quarto nível.

O cadastro herda a série do nível superior, inclusive quando um registro legado não possui série própria. A API normaliza a nomenclatura do Ensino Médio, como `1º Ano`, para `1ª série`, mantendo os anos do Ensino Fundamental na consulta.

Nomes repetidos no mesmo nível retornam conflito 409 com uma orientação para conferir também os itens arquivados. A regra de nomes dos objetos continua sendo por disciplina, conforme o índice existente no banco. Pais arquivados, pais de outra instituição/disciplina e seleção de outra série são rejeitados.

A confirmação ou o erro aparece junto ao botão de cadastro. Se o item foi gravado e a atualização da lista falhar, a mensagem informa que ele foi salvo, evitando um segundo cadastro por engano.

Não há migração de banco de dados. Os testes de integração executam os comandos de cadastro e consulta num esquema isolado de PostgreSQL e removem esse esquema ao terminar.
