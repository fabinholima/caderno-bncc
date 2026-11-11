export function canManageInstitutionTeam(identity) {
  return Boolean(identity?.portalAdmin || identity?.role === 'admin');
}

// Exclusão total de provas com notas e descarte de cartões já corrigidos.
// Todo papel admin (inclui a conta individual do professor, que é admin da
// própria instituição) e a administração do portal. Professores e
// coordenação seguem as regras que preservam o histórico.
export function canPurgeAcademicRecords(identity) {
  return Boolean(identity?.portalAdmin || identity?.role === 'admin');
}
