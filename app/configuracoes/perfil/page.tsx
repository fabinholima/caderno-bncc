'use client';

import { EducatorProfile } from '../../educator-profile';

export default function ProfileSettingsPage() {
  const apiUrl = typeof window === 'undefined'
    ? ''
    : process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? window.location.origin : `${window.location.protocol}//${window.location.hostname}:8788`);
  return <EducatorProfile apiUrl={apiUrl} section="profile" onNavigateSection={(view) => { if (view === 'schools') window.location.assign('/configuracoes/escolas'); }} />;
}
