# Extração assistida para ConTeXt — piloto

O importador existente extrai texto e recorta figuras do PDF. O worker analisa pequenos lotes de questões selecionadas com Gemini e devolve sugestões de ConTeXt editável. PDFs digitalizados continuam usando o OCR existente. Quando a extração local não reconhece questões ou identifica páginas sem texto, o worker envia o PDF diretamente ao Gemini, se o provedor e a chave estiverem configurados. As questões retornam em revisão, sem gabarito inventado e com referência à página original. Esta entrega não reconstrói figuras em MetaPost. Confira fórmulas e figuras no original antes de cadastrar.

## Ativar em produção (VPS)

A API aplica as migrações ao iniciar, incluindo `081_exam_ai_daily_quota.sql`. No `deploy/vps/.env` (usado pelo serviço **imports**), configurar:

```dotenv
EXAM_AI_PROVIDER=gemini
GEMINI_API_KEY=<chave do projeto no Google AI Studio>
GEMINI_EXAM_MODEL=gemini-3.5-flash-lite
EXAM_AI_BATCH_SIZE=5
```

A chave deve ser salva como segredo do servidor. Nunca usar NEXT_PUBLIC para a chave ou incluí-la no Git. O modelo é configurável conforme a disponibilidade e a cota exibidas na conta. Usar um projeto sem faturamento habilitado para o piloto gratuito; o código não pode determinar o plano de faturamento de uma chave. Não há fallback automático para OpenAI ou outro serviço pago.

## Revisão

1. Importar o PDF e executar Extrair questões.
2. Selecionar as questões pendentes e clicar em Converter próximo lote para ConTeXt com IA.
3. Comparar cada sugestão com a página original e aceitar ou rejeitar os campos individualmente. O cadastro em lote exige uma decisão sobre o texto da IA, além das verificações existentes de alternativas, classificação e gabarito.
4. Abrir a questão no editor, corrigir e conferir a prévia. O cadastro individual segue o fluxo editorial existente. A IA nunca cadastra ou aprova uma questão sozinha.
5. Se a conversão falhar, usar Preparar nova conversão desta questão e executar outro lote. Isso mantém o texto editado e arquiva sugestão/revisão anteriores, sem reprocessar questões já analisadas.

## Limites e fila

O piloto admite até **três provas distintas por dia no portal inteiro**, pois a cota do provedor é compartilhada. O dia é calculado em America/Campo_Grande. A admissão é reservada em transação com trava global; lotes e novas tentativas da mesma prova no mesmo dia não consomem outra vaga. Uma admissão que falhar também ocupa vaga naquele dia. A prova que continuar em outro dia ocupa uma vaga desse dia.

O worker existente executa um trabalho por vez. O lote padrão é de cinco questões (máximo dez). São enviados até 30 mil caracteres por questão, com timeout de dois minutos por requisição. Respostas 429 e 503 retornam o trabalho à fila com estágio waiting_quota. O worker aguarda Retry-After, limitado a um dia, ou uma hora na ausência dele. O horário da cota do Google pode ser diferente do limite interno do portal. Cancelamento permanece disponível. Não há garantia de que três provas caibam na cota gratuita, pois depende de páginas, questões e novas tentativas.

## Contrato e segurança

A resposta estruturada é validada no servidor: todas as questões do lote devem estar presentes uma vez, os campos precisam ter os tipos previstos e comandos de acesso externo são rejeitados. Habilidades e tópicos são limitados ao catálogo da instituição. Gabarito gerado é descartado; apenas respostas previamente confirmadas são preservadas.

Os dados do PDF são tratados como conteúdo, não como instruções para a IA. Os avisos de OCR e a confiança são sugestões. Compilar não confirma a fidelidade ao original. O plano gratuito do Gemini pode usar conteúdo para melhorar os produtos do Google; use inicialmente provas públicas sem dados de alunos.

## Endpoints existentes

Todos exigem autenticação e autorização da instituição:

- `POST /api/exam-imports/:id/analyze`: enfileira o próximo lote selecionado; responde 429 ao exceder três provas distintas/dia.
- `POST /api/exam-imports/:id/analyze/cancel`: solicita cancelamento.
- `POST /api/exam-imports/:id/analyze/retry`: enfileira nova tentativa; trabalhos já ativos são reaproveitados.
- O endpoint existente de atualização do candidato aceita `resetAi: true` para preparar nova conversão individual. Rejeita candidatos resolvidos ou análise em andamento; conserva texto, imagens e classificação.
- A consulta existente da importação retorna aiJob (estado, estágio, progresso, consumo e erro) e sugestões por candidato.

## Validação

Testes com respostas simuladas verificam o contrato Gemini, chave no cabeçalho, timeout, cota sem fallback pago, resposta truncada, identificadores duplicados/ausentes, bloqueio de comandos externos e preservação de gabarito confirmado. O teste da admissão usa um cliente de banco simulado; concorrência real deve ser conferida em PostgreSQL na homologação.

Uma chamada real e um teste de prova de ponta a ponta dependem da configuração da chave no worker. Não foram efetuados durante a implementação.

## Alternativa ao OCR local

A leitura direta usa PDF inline (até 15 MB), saída estruturada limitada a 200 questões e timeout de três minutos. Preserva o limite global de três provas por dia; respostas truncadas são rejeitadas. Depende das cotas de tokens e da disponibilidade do modelo. Como o PDF inteiro é enviado ao Google, use documentos que possam ser processados pelo provedor e revise todas as fórmulas e figuras. O recorte automático continua podendo exigir ajuste manual.

## Escolha da IA para conversão

Em cada importação, o seletor “IA para conversão” permite Gemini, DeepSeek ou ChatGPT (OpenAI). A escolha é enviada em `POST /api/exam-imports/:id/analyze` e `/analyze/retry` como JSON `{"provider":"deepseek"}` (também aceita `gemini` e `openai`). O lote guarda o provedor em `exam_import_jobs.ai_provider`; não há fallback pago automático. Jobs antigos usam o padrão do worker.

No worker, configure as chaves correspondentes: `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`. Modelos opcionais: `GEMINI_EXAM_MODEL`, `DEEPSEEK_EXAM_MODEL` (padrão `deepseek-flash`), `OPENAI_EXAM_MODEL`. Chaves permanecem somente no servidor. DeepSeek usa Chat Completions com JSON; as sugestões passam pela mesma validação e revisão humana.

O seletor controla a conversão dos candidatos extraídos; a leitura direta de PDF continua no Gemini. O limite global de três provas por dia permanece para todos os provedores. Aplique a migração 083 antes de iniciar o worker atualizado.
