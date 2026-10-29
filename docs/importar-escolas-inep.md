# Importar o catálogo de escolas do INEP

O cadastro consulta uma tabela local `escolas`, separada dos cadastros privados dos usuários. Baixe o microdado no [portal oficial do Censo Escolar do INEP](https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/censo-escolar). No arquivo ZIP do ano desejado, procure `dados/Tabela_Escola_<ANO>_V2.csv` (o nome pode variar por edição) e extraia apenas esse CSV.

## Preparar a base

Na raiz do projeto, configure `DATABASE_URL` no `.env` e aplique as migrações:

```bash
pnpm --filter @caderno/api migrate
```

## Importar o CSV

Passe o caminho do CSV e o ano censitário. Exemplo para 2025:

```bash
pnpm --filter @caderno/api import:inep-schools -- "/caminho/para/Tabela_Escola_2025_V2.csv" 2025
```

O importador lê o arquivo em fluxo, exige as colunas de nome, código INEP, dependência, situação, município e UF, conserva somente escolas com `TP_SITUACAO_FUNCIONAMENTO = 1` e atualiza registros pelo código INEP. O cabeçalho aceita também alguns nomes alternativos usados em edições anteriores. O importador decodifica o CSV oficial 2025 em Windows-1252 e usa ponto e vírgula como separador.

## Campos e limitações da fonte

O programa mapeia nome, dependência, código INEP, endereço, número, CEP, município, UF, DDD/telefone, CNPJ da escola e e-mail quando as respectivas colunas estão presentes. Campo ausente fica vazio. Não usa CNPJ da mantenedora como CNPJ da escola.

Na edição 2025 consultada, `Tabela_Escola_2025_V2.csv` contém nome, código, dependência, município e UF, além de `NU_CNPJ_ESCOLA_PRIVADA`, mas não tem endereço, número, CEP, telefone ou e-mail. Assim, essas informações permanecem em branco para edição manual no formulário. O logotipo nunca vem do arquivo e continua sendo enviado pelo usuário (PNG/JPEG até 400 KB).

## Testar a busca

Depois de iniciar a API e autenticar-se no portal, a busca pode ser testada no navegador ou com `curl` usando a sessão autenticada:

```bash
curl 'http://localhost:8787/api/escolas?q=escola&uf=MS' \
  -H 'Cookie: COLE_AQUI_O_COOKIE_DA_SESSAO'
```

Ela aceita nome com pelo menos três caracteres ou código INEP de oito dígitos, ignora acentos e caixa, filtra por UF quando informada e devolve até dez sugestões com município, UF e código. O formulário espera 300 ms antes de consultar; selecionar um resultado copia os dados disponíveis, que continuam editáveis. Se nada for encontrado, aparece “Escola não encontrada, preencha manualmente”.

Execute os testes da API com:

```bash
pnpm --filter @caderno/api test
```
