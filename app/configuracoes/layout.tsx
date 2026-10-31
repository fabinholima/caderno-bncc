import type { ReactNode } from 'react';
import { MaintenanceGate } from '../maintenance-gate';
import { SettingsLayout } from './settings-layout';

export default function ConfiguracoesLayout({ children }: { children: ReactNode }) {
  return <MaintenanceGate><SettingsLayout>{children}</SettingsLayout></MaintenanceGate>;
}
