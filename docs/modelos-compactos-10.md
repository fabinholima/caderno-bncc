# Modelos compactos para correção pelo celular

Na montagem da avaliação, escolha um dos layouts:

- **Compacto - 10 questões A–E** (`compacto-10-v1`): de 1 a 10 questões de resposta única.
- **Compacto - 10 questões C/E** (`certo-errado-10-v1`): de 1 a 10 questões de Certo/Errado.

Os dois modelos usam papel A4. O cabeçalho, o QR e o quadro de respostas ficam na primeira página. As questões começam abaixo do quadro, em uma ou duas colunas conforme a seção. Conteúdos maiores continuam nas páginas seguintes. Questões curtas em texto ficam juntas; recursos visuais e textos extensos continuam com a paginação normal do ConTeXt.

Para corrigir, gere a aplicação da prova para a turma e os alunos. O QR da aplicação identifica o aluno e a versão imutável da prova. O QR de uma demonstração ou de uma versão sem aplicação não identifica um aluno cadastrado. Fotografe o QR e as quatro marcas pretas do quadro. Não é necessário fotografar as questões para reconhecer as marcações.

O serviço OMR consulta a aplicação pelo QR antes de escolher o perfil de leitura. Para os modelos compactos, corrige a perspectiva pelas quatro marcas e lê somente as posições conhecidas das respostas. A geometria é compartilhada entre o desenho MetaPost e o leitor em `lib/compact-assessment.mjs`; não altere as posições apenas no template ou apenas no leitor.

O cartão A–E usa duas colunas de cinco linhas. O cartão C/E tem a mesma área de referência, com duas opções por linha. A ordem de leitura é 1–5 à esquerda e 6–10 à direita. As posições das opções C/E permanecem fixas quando a ordem das questões muda.

O gabarito do professor é separado do cartão em branco do aluno e contém as letras corretas da versão. Respostas vazias, duplas ou pouco preenchidas, círculos incompatíveis com a geometria e marcas de referência ausentes exigem revisão. Não há confirmação automática nesses casos. Fotos reais com iluminação, foco e impressão diferentes ainda devem ser verificadas antes de uso em sala.

## Verificação focada

```sh
node --test services/renderer/compact-assessment.test.mjs services/renderer/template-registry.test.mjs services/omr/card-reading.test.mjs
.venv-omr/bin/python -m unittest services/omr/test_compact_card.py
pnpm exec tsc --noEmit --incremental false
pnpm build
```

Os testes de imagem exigem as dependências de `services/omr/requirements.txt`. O container OMR copia `lib/` para consumir o mesmo perfil de geometria do renderizador.
