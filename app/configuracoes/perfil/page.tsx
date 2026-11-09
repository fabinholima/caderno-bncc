'use client';

import { EducatorProfile } from '../../educator-profile';
import { useSettingsApiUrl } from '../settings-layout';

export default function ProfileSettingsPage() {
  const apiUrl = useSettingsApiUrl();
  return (
    <EducatorProfile
      apiUrl={apiUrl}
      section="profile"
      onNavigateSection={(view) => {
        if (view === 'schools')
          window.location.assign('/configuracoes/escolas');
      }}
    />
  );
}
