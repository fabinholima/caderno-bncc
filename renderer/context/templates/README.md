# Layouts ConTeXt versionados

O layout é um adaptador de apresentação. Questões, respostas, habilidades BNCC e a ordem das versões continuam no snapshot da avaliação; o modelo controla somente a composição tipográfica.

## O que um layout pode controlar

- formato do papel, margens, fontes, cabeçalho e rodapé;
- identificação do estudante e da versão;
- aparência das seções, questões, alternativas e pontuação;
- folha de respostas, gabarito e comentários do professor;
- blocos seguros de fórmula, tabela, imagem cadastrada e MetaPost.

## Como criar o próximo modelo

1. Copie `services/renderer/templates/basicexam-v1.mjs` para um novo arquivo, por exemplo `layout-fabio-v1.mjs`.
2. Mantenha o identificador imutável. Uma alteração incompatível deve gerar `layout-fabio-v2`, sem modificar provas antigas.
3. Exporte um objeto com `id` e `render(dados)`. O método recebe apenas conteúdo já validado e escapado pelo contrato do renderizador.
4. Registre o modelo em `services/renderer/template-registry.mjs` e seus metadados em `lib/render-templates.mjs`.
5. Execute os testes e gere uma prova e um gabarito de amostra antes de disponibilizar o modelo no portal.

O navegador envia somente o identificador cadastrado. Caminhos locais, comandos, módulos e arquivos enviados pelo usuário não são aceitos pelo worker.

## Contrato recebido pelo layout

`render()` recebe: `paper`, `mode`, `institution`, `title`, `grade`, `version`, `points`, `candidate` e `content`. Os campos `candidate` e `content` já contêm comandos ConTeXt produzidos pelo renderizador; os demais textos já estão escapados.

O modelo inicial usa `t-basicexam` para numerar e apresentar as questões. Um modelo futuro pode trocar a tipografia ou o módulo sem alterar a API nem o PostgreSQL, desde que preserve esse contrato.
