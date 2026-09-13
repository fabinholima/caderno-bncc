# Arquitetura de produção

## Primeira implantação recomendada

O portal deve começar em uma única região, com o frontend separado dos
processos pesados. A API permanece sem estado; PostgreSQL guarda o domínio e as
filas persistentes; uma máquina de workers possui ConTeXt, Poppler, Tesseract,
ImageMagick, RDKit, librsvg e OpenCV. Essa divisão permite aumentar os workers
sem replicar a API.

```text
Internet
   |
   +-- Frontend HTTPS (CDN) -----------+
   |                                    |
   +-- API HTTPS (2 réplicas) ----------+-- PostgreSQL gerenciado
                                        |
                                        +-- volume privado persistente
                                              |-- PDFs importados
                                              |-- provas e gabaritos
                                              +-- relatórios
                                        |
                                        +-- workers
                                              |-- ConTeXt/PDF
                                              |-- importação/OCR/IA
                                              +-- leitura OMR
```

Os workers disputam trabalhos com `FOR UPDATE SKIP LOCKED`, portanto podem ser
replicados sem processar a mesma tarefa simultaneamente. Para o lançamento,
comece com um worker ConTeXt, um worker de importação e um worker OMR. Métricas
de tempo de fila e CPU determinarão quando aumentar cada grupo.

## Componentes e limites

| Componente | Estado local | Escala inicial | Observação |
| --- | --- | ---: | --- |
| Frontend | nenhum | CDN | `NEXT_PUBLIC_API_URL` aponta para a API HTTPS |
| API | nenhum | 2 réplicas | pool de 10 conexões por réplica |
| PostgreSQL | persistente | serviço gerenciado | backups e recuperação para um ponto no tempo |
| Worker ConTeXt | cache e saída | 1 | limite de CPU/memória e concorrência controlada |
| Worker de importação | temporários | 1 | a chave OpenAI existe somente neste processo |
| Worker OMR | temporários | 1 | cartões duvidosos continuam em revisão humana |
| Arquivos | persistente | 1 volume privado | compartilhado por API e workers nesta fase |

Com 2 réplicas da API e pool 10, reserve pelo menos 30 conexões no banco para a
API e os workers. Não aumente réplicas sem recalcular esse orçamento.

## Arquivos e evolução para armazenamento de objetos

A implementação atual usa caminhos locais por meio de `EXAM_STORAGE_DIR` e
`RENDER_OUTPUT_DIR`. Na primeira publicação, monte o mesmo volume privado nesses
caminhos na API e na máquina de workers. O volume não pode ser servido
diretamente pela internet: todo download passa pelas rotas autenticadas da API.

Antes de operar em múltiplas máquinas ou regiões, introduza uma interface de
armazenamento com dois adaptadores (`filesystem` e `object-storage`). No segundo,
grave apenas a chave do objeto no PostgreSQL e entregue downloads por URL curta
assinada. Essa migração deve ocorrer antes de escalar horizontalmente os workers
em hosts diferentes.

## Segurança obrigatória

- `NODE_ENV=production` e `DEV_AUTH_BYPASS=false`;
- TLS no frontend, API e conexão com o PostgreSQL;
- origens CORS HTTPS explícitas, nunca `*`;
- `QR_SIGNING_SECRET` aleatório, com no mínimo 32 caracteres;
- chave OpenAI apenas no worker de importação;
- banco e volume sem acesso público;
- logotipos, PDFs e cartões tratados como dados privados da instituição;
- retenção definida para imagens de cartões e PDFs originais;
- restauração de backup ensaiada antes do lançamento.

Execute `pnpm check:production-env` no processo de entrega antes de iniciar a
API ou os workers. O comando falha se detectar autenticação de desenvolvimento,
CORS aberto, segredo fraco ou caminhos relativos.

## Implantação e migrações

1. Crie o PostgreSQL gerenciado, banco vazio e usuário de aplicação sem poderes
   administrativos globais.
2. Faça backup e execute os arquivos `database/*.sql` em ordem numérica uma
   única vez. Registre cada migração aplicada na entrega.
3. Monte o volume privado e crie `exams`, `renders` e `tex-cache` com escrita
   permitida somente aos processos da aplicação.
4. Instale e fixe as versões das ferramentas nativas no host dos workers.
5. Configure os segredos a partir de `deploy/production.env.example` e execute a
   validação.
6. Inicie API, worker ConTeXt, worker de importação e OMR.
7. Publique o frontend e faça os testes de fumaça abaixo.

As migrações não devem ser executadas automaticamente por todas as réplicas da
API. A entrega roda uma etapa exclusiva de migração antes de trocar o tráfego.

## Testes de fumaça

- `GET /health` responde sem expor segredos;
- login, encerramento de sessão e isolamento entre instituições funcionam;
- cadastro e edição de uma questão funcionam;
- uma prova pequena gera prova, gabarito, QR e cartão-resposta;
- um PDF importado chega à revisão sem cadastro automático pela IA;
- um cartão conhecido é corrigido e um cartão ambíguo pede revisão;
- relatórios PDF, CSV e Excel são baixados somente pela instituição correta;
- restauração do backup em ambiente isolado preserva avaliações e resultados.

## Observabilidade e capacidade

Registre em formato estruturado o identificador da instituição, rota ou tipo de
trabalho, duração e resultado, mas nunca o texto integral das questões, tokens,
senhas ou imagens. Acompanhe:

- latência e erros da API;
- conexões utilizadas no PostgreSQL;
- quantidade e idade do trabalho mais antigo em cada fila;
- duração e taxa de falha de ConTeXt, OCR, IA e OMR;
- uso e crescimento do volume;
- custo e tokens da análise assistida por instituição.

Configure alertas para fila parada, disco acima de 80%, falhas repetidas de
renderização, backup ausente e taxa elevada de respostas HTTP 5xx.

## Próximas decisões antes da assinatura

Depois do piloto, implementar cotas transacionais por plano: número de provas,
armazenamento, páginas importadas, análises por IA e concorrência de workers.
Cobrança nunca deve ser inferida apenas do frontend; a API aplica a cota dentro
da mesma transação que enfileira o trabalho e registra o evento de uso para
auditoria.
