# PWA do professor e do aluno

O aplicativo `ufaprova-mobile` também é publicado como PWA, um só site estático
servido em dois endereços:

- `https://professor.ufaprova.com.br`: abre na entrada do professor;
- `https://aluno.ufaprova.com.br`: abre direto na área do aluno.

O subdomínio só escolhe a tela inicial. As permissões continuam na API: uma conta
de aluno recebe 403 em qualquer rota de professor, seja qual for o endereço.

## Sessão no navegador

- O login pelo navegador usa o cookie `caderno_session` (HttpOnly). O corpo da
  resposta não traz token, porque o token só é devolvido para `x-client: mobile`.
- A entrada Google usa o fluxo do aplicativo (`/api/auth/google/mobile/*`). Ao
  final, o navegador troca o token obtido pelo cookie em
  `POST /api/auth/session/cookie` e descarta o token.
  - Exige `Origin` autorizada (403 sem ela ou com origem estranha).
  - Exige `Authorization: Bearer <token>` válido (401 se inválido).
  - Responde `{ "data": { "authenticated": true } }` com `Set-Cookie`.
- Os dois subdomínios usam a mesma sessão da API: quem entra como aluno pela
  entrada do professor é encaminhado à área do aluno já conectado. Sair em um
  endereço encerra a sessão nos dois.

## Origens

`https://professor.ufaprova.com.br` e `https://aluno.ufaprova.com.br` entram em
`productionOrigins` (`services/api/request-security.mjs`). Fora de produção, só
valem as origens de `CORS_ORIGIN`. No desenvolvimento local, por exemplo:
`CORS_ORIGIN=http://localhost:3000,http://localhost:8081`.

## Domínio da API

Recomendado: publicar a API também em `https://api.ufaprova.com.br`. Com a API
em `ufaprova-api.onrender.com`, o cookie é de outro site para o navegador
(`onrender.com` está na lista pública de sufixos). O Safari e navegadores que
bloqueiam cookies de terceiros podem então recusar a sessão. Com a API no mesmo
domínio, o cookie é do mesmo site.

Passos (feitos por quem administra o Render e o DNS):

1. No serviço `ufaprova-api`, adicione o domínio personalizado `api.ufaprova.com.br`.
2. No DNS, crie o CNAME indicado pelo Render.
3. O endereço antigo continua funcionando para o aplicativo nativo.

## Implantação

1. Publique a API com esta versão: as novas origens e `/api/auth/session/cookie`.
2. Crie o site estático `ufaprova-pwa` a partir do `render.yaml` do repositório
   `ufaprova-mobile`. O arquivo não cria nada sozinho; o serviço só passa a
   existir quando alguém o cria no painel.
3. Adicione os domínios `professor.ufaprova.com.br` e `aluno.ufaprova.com.br` ao
   site e crie os CNAMEs no DNS.
4. Ajuste `EXPO_PUBLIC_API_URL` no site, se a API ainda não estiver em
   `api.ufaprova.com.br`. A CSP do `render.yaml` já libera os dois endereços da API.

Nenhuma migração de banco é necessária.
