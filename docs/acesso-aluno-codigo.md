# Acesso do aluno sem e-mail (código pessoal e senha)

Para o aluno que não tem e-mail. O código pessoal (`students.access_code`, formato `UFA-XXXXXXXX`) já existe para cada aluno cadastrado pelo professor e aparece na página Alunos do portal.

## Fluxo

1. **Primeiro acesso (app):** o aluno escolhe "Não tenho e-mail · entrar com o código da escola" e depois "Primeiro acesso ou esqueci a senha".
2. Digita o código. O app mostra nome, escola e turmas, e o aluno confirma ("Sou eu") ou volta ("Não sou eu"; nada é gravado).
3. Cria a senha (pelo menos 8 caracteres) e já entra. A conta não tem e-mail e fica ligada à matrícula e às turmas na hora.
4. **Acessos seguintes:** código + senha.
5. **Esqueceu a senha:** o professor usa "Gerar novo código de acesso" no menu "⋯" do aluno. O código antigo deixa de valer e as sessões da conta são encerradas. O aluno faz o primeiro acesso com o código novo e cria outra senha na mesma conta, sem perder o histórico.

## Regras

- O código vale uma vez para o primeiro acesso (`students.access_code_used_at`). Depois, só serve para entrar com a senha.
- Cadastro já ligado a uma conta com e-mail não usa este fluxo: o aluno entra e recupera a senha pelo e-mail.
- Limites: o das rotas `/api/auth` por IP e 10 tentativas a cada 15 minutos por código.
- Só contas de aluno podem não ter e-mail (`users_email_required_check`).
- Quem vê o código pode fazer o primeiro acesso antes do aluno. Entregue o código individualmente. Se outra pessoa usou, gere um novo código; o primeiro acesso com ele troca a senha.

## Rotas

| Rota | Quem | Uso |
|---|---|---|
| `POST /api/auth/student/first-access/inspect` `{code}` | Público | Nome, escola, turmas e `passwordReset` (já existe conta: senha nova) |
| `POST /api/auth/student/first-access` `{code,password}` | Público | Cria a conta ou troca a senha; devolve a sessão, como o login |
| `POST /api/auth/student/code-login` `{code,password}` | Público | Login por código e senha |
| `POST /api/students/:id/access-code` | Professor e gestor da instituição | Gera um novo código |

As rotas públicas aceitam o app nativo sem `Origin` (cabeçalho `x-client: mobile`) e, na web, só as origens aprovadas.

Migração: `104_student_code_login.sql` (aditiva).
