import type { ReactNode } from 'react';
import { SettingsLayout } from './settings-layout';

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
