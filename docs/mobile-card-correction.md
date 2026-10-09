# Correção de cartões no aplicativo

A seleção usa aplicações já criadas no portal, não combinações independentes de avaliação e turma. `GET /api/assessment-applications` inclui `assessmentId` e `classId`; aplicações canceladas ou sem alunos não aparecem na seleção móvel. As listas são guardadas por conta para uso offline.

Novas capturas incluem `applicationId` no contexto local. `POST /api/card-scans` recebe `expectedApplicationId`; a migração 072 armazena esse vínculo. O servidor verifica instituição e disponibilidade da aplicação. A assinatura de idempotência inclui a aplicação, impedindo reutilizar o mesmo ID de envio em outro contexto.

O worker confere o QR e a aplicação antes de calcular a nota. A revisão lista apenas alunos daquela aplicação e bloqueia uma tentativa de confirmar outro aluno/contexto. O leitor enumera linhas de bolhas; o gabarito imutável define os números reais das questões. Quantidade diferente de linhas ou alternativas incompatíveis exige revisão, sem atribuir zeros automaticamente às questões que não foram reconhecidas.

`GET /api/mobile-sync` mantém versão 1 e adiciona `applicationScopedUploads:true`. O app só envia novas capturas vinculadas a uma aplicação quando essa capacidade está disponível. A foto permanece no aparelho durante indisponibilidade. Envio, consulta, revisão e resultado reutilizam a fila offline e os recibos existentes.

A câmera oferece prévia, refazer foto, lanterna e recuperação de falhas. Voltar do segundo plano exige a câmera ficar pronta novamente. O professor deve enquadrar cartão inteiro, QR e todas as alternativas; cartões devem ser os individuais gerados pelo portal.

## Validação reproduzível

Use somente banco descartável e as dependências de `services/omr/requirements.txt`:

```
python services/omr/make-test-card.py /tmp/card-test.png
MOBILE_SYNC_TEST_DATABASE_URL=... OMR_TEST_IMAGE=/tmp/card-test.png OMR_PYTHON=... node --test services/api/mobile-sync.integration.test.mjs
node --test services/omr/card-reading.test.mjs
```

O teste opcional inicia o worker real: reconhece dez respostas, confirma nota 10/10 e bloqueia o mesmo cartão quando enviado para outra aplicação. A suíte também valida o filtro de alunos, isolamento de instituição, idempotência, revisão e conservação do contexto local. O cartão é sintético; validação final com foto de um cartão impresso no celular continua necessária.
