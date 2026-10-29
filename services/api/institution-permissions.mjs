export function canManageInstitutionTeam(identity) {
  return Boolean(identity?.portalAdmin || identity?.role === 'admin');
}
