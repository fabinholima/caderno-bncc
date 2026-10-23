# Elaboração e armazenamento de provas

A entrada mostra Nova prova, Continuar rascunho e o histórico paginado em grupos de dez. Favoritas aparecem primeiro. O arquivo conserva todas as montagens; sair das dez primeiras não exclui dados. A migração 090 recupera as montagens das avaliações existentes a partir da primeira versão congelada.

O fluxo percorre identificação/modelo, seleção, organização, revisão ConTeXt e aplicação. Modelos compactos usam A4, até dez questões e tipos compatíveis. A ordem escolhida é preservada quando o embaralhamento de questões está desmarcado. A pontuação pertence à montagem e é congelada no snapshot, sem alterar o banco de questões.

Rascunhos pertencem ao professor e à instituição. `assessment_workspaces` guarda identificação, layout, seções ordenadas, referências às questões, pontos e vínculo com a última avaliação gerada. O salvamento usa revisão otimista: uma sessão desatualizada recebe 409. O cliente serializa as escritas, aguarda 650 ms após alterações e envia a última alteração pendente ao desmontar a tela. Falhas ficam visíveis e permitem tentar novamente ou reabrir a versão salva. Fechar o navegador antes da confirmação de salvamento pode interromper a requisição.

A prova congelada, suas versões e aplicações são independentes do rascunho. Editar invalida a prévia atual; a geração seguinte cria um novo snapshot. Regenerar o PDF de uma prova salva mantém o snapshot original, inclusive ordem, respostas e semente. Trabalhos personalizados de alunos não aparecem como versões adicionais na consulta da prova.

A revisão carrega os PDFs autenticados da prova e do gabarito. Após a composição de todas as versões, o professor pode selecionar turma e alunos ativos matriculados. O serviço de aplicações associa o QR assinado a aplicação, aluno e versão. A área de correção existente recebe as fotografias desses cartões.

## Política de retenção

- Montagens, snapshots, versões, gabaritos, fontes `.tex` e dependências de imagens são permanentes enquanto houver a prova. Nenhuma limpeza de cache deve remover esses dados.
- Arquivos auxiliares PNG/JPEG/SVG/PDF são incluídos no manifesto do render. No armazenamento configurado (filesystem/S3), a chave usa SHA-256 do conteúdo, permitindo reutilização entre trabalhos. Os nomes usados pelo TeX ficam associados às chaves no manifesto. No modo legado, as dependências permanecem na pasta do trabalho.
- O prazo definido para elegibilidade de cache de PDF é **30 dias**, registrado em `pdfCacheExpiresAt`. O prazo não implica exclusão automática nesta implementação. Um coletor futuro só poderá excluir `studentPdf` e `answerKeyPdf` de trabalhos sem aplicação/correção vinculada, após verificar fontes e dependências recuperáveis. Não configurar expiração geral no bucket.
- Provas vinculadas a aplicações e correções permanecem preservadas, inclusive arquivos personalizados e QR codes. A exclusão do rascunho não faz parte deste fluxo.
- O download de `.tex` entrega o fonte; suas dependências são conservadas no manifesto e no armazenamento. Não é um pacote ZIP autossuficiente.

## Instalação e validação

Aplicar as migrações 089 e 090 pelo migrador existente (`pnpm --filter @caderno/api migrate`, com `DATABASE_URL` do ambiente), atualizar API, portal e renderer. As migrações foram verificadas em PostgreSQL 17 isolado; nenhum banco de produção foi alterado.

Testes focados:

```sh
node --test services/api/assessment-workspaces.test.mjs services/api/render-artifact-storage.test.mjs
ASSESSMENT_WORKSPACE_TEST_DATABASE_URL=postgresql://... node --test services/api/assessment-workspaces.integration.test.mjs
.venv-omr/bin/python -m unittest services/omr/test_compact_card.py
pnpm test:services
pnpm exec tsc --noEmit
pnpm build
```

A validação fotográfica real exige uma foto de cartão impresso e preenchido. Imagens renderizadas e transformações sintéticas não substituem esse teste.
