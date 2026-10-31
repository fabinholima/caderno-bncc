'use client';
import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Folha A4 aberta sobre o portal; ao imprimir, só ela vai para o papel (ver globals.css).
export function PrintSheet({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <dialog open aria-modal="true" aria-label={title} className="print-sheet fixed inset-0 z-50 m-0 size-full max-h-none max-w-none overflow-y-auto border-0 bg-slate-900/60 p-4">
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 shadow">
        <p className="font-semibold text-slate-900">{title}</p>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button type="button" onClick={() => window.print()}><Printer /> Imprimir</Button>
          <Button type="button" variant="outline" onClick={onClose}><X /> Fechar</Button>
        </div>
      </div>
      <div className="print-page mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[12mm] text-slate-900 shadow-xl">{children}</div>
    </dialog>,
    document.body,
  );
}
