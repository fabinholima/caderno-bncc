// Exigências de acesso aplicadas em sequência depois do login. Cada barreira
// declara quem ela bloqueia e quais caminhos ficam liberados; o servidor só
// consulta a barreira na posição dela. Assim a regra fica num lugar só, com
// teste próprio, em vez de listas repetidas no meio das rotas.

/** Rotas da própria conta: sempre disponíveis para quem está logado. */
export const ACCOUNT_PATHS = Object.freeze([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/logout-all',
]);

/** Também liberadas antes do perfil completo: entrar numa equipe e trocar de instituição. */
export const ONBOARDING_PATHS = Object.freeze([
  ...ACCOUNT_PATHS,
  '/api/auth/institution',
  '/api/invitations/accept',
]);

const staffBypass = (identity) =>
  identity.portalAdmin || identity.developmentBypass;

export const gates = Object.freeze({
  /** Alunos só usam as rotas da área do aluno (routes/student-area-routes.mjs). */
  studentArea: (identity, pathname) =>
    identity.role === 'student' && !ACCOUNT_PATHS.includes(pathname)
      ? {
          status: 403,
          error: 'Este recurso é exclusivo de professores e gestores.',
        }
      : null,
  /** Professores e gestores precisam do CPF cadastrado. */
  cpf: (identity, pathname) =>
    identity.role !== 'student' &&
    !staffBypass(identity) &&
    !identity.cpfComplete &&
    !ACCOUNT_PATHS.includes(pathname)
      ? {
          status: 428,
          error: 'Complete o cadastro com seu CPF para continuar.',
        }
      : null,
  /** ...e do perfil com a escola cadastrada. */
  profile: (identity, pathname) =>
    identity.role !== 'student' &&
    !staffBypass(identity) &&
    !identity.profileComplete &&
    !ONBOARDING_PATHS.includes(pathname)
      ? {
          status: 428,
          error: 'Complete seu perfil e cadastre sua escola para continuar.',
        }
      : null,
});
