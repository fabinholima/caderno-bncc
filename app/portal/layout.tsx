import type { ReactNode } from 'react';
import { MaintenanceGate } from '../maintenance-gate';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <MaintenanceGate>{children}</MaintenanceGate>;
}
