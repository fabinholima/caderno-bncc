# Projeto do aplicativo móvel de correção

Escopo desta etapa: projeto funcional e técnico, não aplicativo publicado. A primeira versão será uma PWA responsiva instalada pelo navegador; aplicativo nativo e publicação em lojas ficam para depois da validação do fluxo de câmera e leitura.

## Fluxo do professor

1. Entrar com a conta do portal; escolher uma das escolas salvas.
2. Selecionar avaliação, versão e turma. Não inferir o gabarito pela ordem aparente das questões: usar o identificador da versão.
3. Fotografar a folha de respostas. A câmera só abre mediante ação explícita e permissão; permitir escolher imagem já existente como alternativa.
4. Conferir nitidez, enquadramento e identificação antes de enviar. Usar marcadores e QR da avaliação para associar versão e aluno, sem expor CPF no QR.
5. Mostrar leitura preliminar: alternativas reconhecidas, marcações duplas e respostas incertas destacadas. Baixa confiança exige revisão; não atribuir nota definitiva silenciosamente.
6. Confirmar correções e publicar resultado uma única vez. Discursivas continuam sob correção manual do professor; fórmulas e imagens não são notas automáticas.
7. Consultar resultados da turma e exportar pelo portal, com histórico das alterações.

## Telas

- Início: escola, avaliações recentes, trabalhos pendentes.
- Captura: guia de alinhamento, câmera/arquivo, orientação e recaptura.
- Revisão: imagem ao lado das respostas detectadas, incertezas e comparação com gabarito.
- Resultado: acertos, nota, respostas revisadas e confirmação.
- Configurações: escolas, sessão e privacidade.

## Integração e segurança

Reutilizar autenticação, avaliações, aplicações e revisão OMR existentes. Mapear e testar os endpoints atuais antes de adicionar novos. Todo pedido valida instituição e propriedade da avaliação no backend; perfil de editor não concede acesso aos alunos de terceiros.

Envios usam chave de idempotência para impedir correções duplicadas após perda de rede. Processamento em fila no servidor, com estados enviado/processando/revisão/concluído/erro e repetição segura. Fotos devem ter limites de formato e tamanho, EXIF removido e prazo de retenção definido antes da implantação.

HTTPS é necessário para câmera em produção. Não guardar fotos de alunos ou gabaritos no cache público/service worker. Na primeira versão, capturar e enviar somente online; modo offline exige armazenamento criptografado, expiração e sincronização segura e será uma etapa separada.

## Critérios de aceite antes do lançamento

Testar Android/Chrome e iOS/Safari, câmera negada, conexão interrompida, foto desfocada, folhas inclinadas, versões embaralhadas, marcações duplas, aluno não identificado, isolamento entre escolas e repetição do mesmo envio. A revisão humana deve estar disponível antes de confirmar a nota.
