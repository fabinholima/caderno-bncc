'use client';

import { EducatorProfile } from '../../educator-profile';
import { useSettingsApiUrl } from '../settings-layout';

export default function SchoolSettingsPage() {
  const apiUrl = useSettingsApiUrl();
  return <EducatorProfile apiUrl={apiUrl} section="schools" />;
}
