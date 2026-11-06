# Instruções para o Claude

## Idioma

- Responda ao usuário sempre em português, inclusive resumos, instruções e comandos explicados.

## Git

- Envie todas as mudanças diretamente para o branch `main` (`git push origin HEAD:main`), sem abrir pull request e sem pedir confirmação.
- Antes de enviar, faça `git fetch origin main` e garanta que o envio seja fast-forward: se o `main` remoto tiver avançado, faça rebase das suas mudanças sobre ele. Nunca use force push no `main`.
- Se a sessão indicar um branch de desenvolvimento, mantenha-o também atualizado com o mesmo commit.

## Verificações antes do push

- Formatação: `npx oxfmt <arquivos alterados>`
- Lint: `npx oxlint <arquivos alterados>`
- Tipos: `npx tsc --noEmit -p .`
