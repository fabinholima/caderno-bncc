# Recuperar questões que faltam após a migração do Render

`services/api/recover-questions.mjs` compara o banco atual com uma cópia
(o banco do Render ou qualquer backup `.dump`) e recupera as questões que
existem na cópia e faltam no banco atual: questão, revisões, alternativas e
vínculos com habilidades BNCC e descritores SAEB, com os ids originais.

- Sem `--apply` só mostra o relatório; nada é alterado.
- A cópia é lida numa transação somente leitura.
- Tudo é gravado numa única transação no banco atual. Uma questão que não puder
  entrar (ex.: autor inexistente no banco atual) é pulada e listada.
- Se o código da questão (ex.: `FIS-0012`) já foi usado por outra questão
  depois da cópia, a recuperada recebe o próximo código livre; o relatório mostra
  a troca.
- Habilidades e descritores são ligados pelo código (ex.: `EM13CNT101`), não
  pelo id, porque os catálogos podem ter sido recriados por migrações. Vínculo
  sem correspondente é descartado e aparece em "Avisos".
- Edições feitas só na cópia (revisões novas de questões que existem nos dois
  bancos) são listadas, mas não aplicadas.

Todos os comandos abaixo rodam no VPS, em `/opt/ufaprova/deploy/vps`. Antes,
atualize o sistema (`deploy/atualizar-producao.sh`) para a API ter o script.

## 1. Copiar o banco do Render para um arquivo (somente leitura)

Reative o banco no Render e copie a External Database URL. O `pg_dump` só lê:

```sh
docker compose exec -T postgres pg_dump "URL_DO_RENDER" --no-owner --no-acl -Fc -f /backups/render-recuperacao.dump
```

Se o banco do Render não estiver disponível, use um dos arquivos que já estão em
`backups/` (`render-final.dump`, `render-inicial.dump`, `caderno-*.dump`,
`ufaprova-*.dump`) no lugar de `render-recuperacao.dump` nos passos seguintes.

## 2. Restaurar a cópia num banco separado

```sh
docker compose exec -T postgres psql -U caderno -d postgres -c "CREATE DATABASE caderno_recuperacao OWNER caderno;"
```

```sh
docker compose exec -T postgres pg_restore -U caderno -d caderno_recuperacao --no-owner --no-acl /backups/render-recuperacao.dump
```

O banco em uso (`caderno`) não é tocado.

## 3. Ver o que falta

```sh
docker compose exec api node recover-questions.mjs --source-db caderno_recuperacao
```

O relatório mostra as tabelas com menos linhas no banco atual que na cópia e a
lista das questões faltantes (código, disciplina, série, fonte, autor). Para
olhar só uma parte, use `--match`, que procura no código, na disciplina e na
fonte:

```sh
docker compose exec api node recover-questions.mjs --source-db caderno_recuperacao --match IME
```

Se as questões procuradas não aparecem como faltantes, elas também não estão na
cópia: repita os passos 2 e 3 com outro arquivo de `backups/`.

## 4. Recuperar

Faça um backup do banco atual e depois rode com `--apply` (com o mesmo
`--match`, se quiser recuperar só aquelas):

```sh
./backup-postgres.sh
```

```sh
docker compose exec api node recover-questions.mjs --source-db caderno_recuperacao --match IME --apply
```

Rodar de novo é seguro: as questões já recuperadas deixam de aparecer como
faltantes. As imagens das questões ficam no S3, que é o mesmo do Render.

## 5. Limpar

```sh
docker compose exec -T postgres psql -U caderno -d postgres -c "DROP DATABASE caderno_recuperacao;"
```

Depois, troque a senha do banco no Render (ou apague-o, quando não precisar
mais dele) se a URL tiver sido compartilhada.
