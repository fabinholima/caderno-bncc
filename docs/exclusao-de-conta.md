# Exclusão da conta pelo próprio usuário

Exigida pela Play Store (dentro do app e por um link na web) e prevista na LGPD.

## Onde

- **App:** "Excluir minha conta", no fim da tela do professor e da tela do aluno.
- **Web:** `https://ufaprova.com.br/excluir-conta`, com a sessão do portal. É o link para informar no Play Console. A política de privacidade aponta para ela.
- **API:** `POST /api/account/delete` `{confirm:"EXCLUIR", password?}` com a sessão. Na web, só as origens aprovadas; no app, `x-client: mobile`. Liberada antes do CPF e do perfil completos (`ACCOUNT_PATHS`).

Conta com senha confirma a senha. Conta só com Google não tem senha: basta a sessão e o `EXCLUIR`.

## O que acontece

A linha de `users` fica, porque provas, questões e registros apontam para ela, mas sem dados pessoais:

- `email`, `password_hash`, `google_subject`, `cpf_hash` e `email_verified_at` viram nulos, o nome vira "Conta excluída", `active=false`, `deleted_at` e `anonymized_at` preenchidos.
- Saem as sessões, os tokens de senha e de verificação, `memberships`, `class_memberships` e `educator_profiles` (telefone e selfie).
- Aluno: sai a ligação em `student_account_links` e a foto do cadastro (`students.selfie_data_url`). O cadastro do aluno, as matrículas e as notas ficam com a escola. Para o aluno voltar, o professor gera um novo código.
- `audit_log` recebe `account.self_deleted`.
- O app apaga do aparelho os dados da conta, inclusive fotos de cartões ainda não enviadas.

O e-mail e o CPF ficam livres para um cadastro novo. O portal (Assinantes) não restaura uma conta anonimizada.

## Quando é recusada

- Administrador do portal (409).
- Único administrador ativo de uma escola com outras pessoas ativas, ou com contrato de cobrança não cancelado (409): passe a administração ou cancele a assinatura antes.

Escola só da própria pessoa, sem assinatura, fica sem membros, com os dados dela. Hoje não há remoção automática desses dados.

Migração: `118_self_account_deletion.sql` (aditiva).
