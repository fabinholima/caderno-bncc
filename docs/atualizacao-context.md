# Atualização do ConTeXt

A API e o renderer instalam o ConTeXt durante o build da imagem
(`services/api/Dockerfile` e `services/renderer/Dockerfile`). Os dois downloads
externos são conferidos por soma SHA-256 antes de serem usados:

- `CONTEXT_INSTALLER_SHA256`: instalador `context-linux-64.zip` da Pragma. É um
  arquivo "rolling": a Pragma o substitui a cada nova versão do ConTeXt.
- `BASICEXAM_SHA256`: módulo `basicexam-2026.04.28.zip`, com versão no nome.

Se a soma não confere, o build para com `sha256sum: ... FALHOU` e a versão em
produção continua no ar.

## Aviso mensal

O workflow **Conferir instalador do ConTeXt** roda no primeiro dia de cada mês
(ou manualmente pela aba **Actions**). Quando a Pragma publica um instalador
novo, o job falha e o GitHub avisa por e-mail. Nada é publicado
automaticamente.

## Como atualizar

1. Baixe o instalador e calcule a soma:

   ```bash
   curl -fLO https://lmtx.pragma-ade.nl/install-lmtx/context-linux-64.zip && sha256sum context-linux-64.zip
   ```

2. Troque o valor de `ARG CONTEXT_INSTALLER_SHA256` nos dois Dockerfiles.
3. Rode o CI e faça uma renderização de prova em homologação.
4. Publique pelo workflow **Deploy produção** (`docs/atualizacao-producao.md`).

O build reaproveita a camada em cache enquanto o Dockerfile não muda; para
forçar a instalação nova no servidor, use
`docker compose build --no-cache api renderer`.
