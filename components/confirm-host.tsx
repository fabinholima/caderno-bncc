'use client';

import { useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { type ConfirmRequest, setConfirmListener } from '@/lib/confirm';

// Palavras que indicam uma ação que apaga ou desfaz algo: o botão de
// confirmação fica vermelho e repete o verbo.
const destructive = [
  ['excluir', 'Excluir'],
  ['apagar', 'Apagar'],
  ['remover', 'Remover'],
  ['descartar', 'Descartar'],
  ['desativar', 'Desativar'],
  ['rejeitar', 'Rejeitar'],
  ['cancelar', 'Cancelar'],
  ['limpar', 'Limpar'],
  ['arquivar', 'Arquivar'],
] as const;

function confirmLabel(message: string) {
  const text = message.toLowerCase();
  const hit = destructive.find(([word]) => text.includes(word));
  return hit
    ? { label: hit[1], danger: true }
    : { label: 'Confirmar', danger: false };
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  useEffect(() => {
    setConfirmListener((request) => setQueue((items) => [...items, request]));
    return () => setConfirmListener(null);
  }, []);
  const current = queue[0];
  function answer(ok: boolean) {
    current?.resolve(ok);
    setQueue((items) => items.slice(1));
  }
  const { label, danger } = current
    ? confirmLabel(current.message)
    : { label: '', danger: false };
  const [title, ...rest] = current
    ? current.message.split(/(?<=[?.!])\s+/)
    : [''];
  return (
    <AlertDialog
      open={Boolean(current)}
      onOpenChange={(open) => !open && answer(false)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {current?.kind === 'alert' ? 'Atenção' : title}
          </AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {current?.kind === 'alert' ? current.message : rest.join(' ')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {current?.kind === 'alert' ? (
            <AlertDialogAction onClick={() => answer(true)}>
              Entendi
            </AlertDialogAction>
          ) : (
            <>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                className={
                  danger
                    ? 'bg-destructive text-white hover:bg-destructive/90 dark:text-[#172b4d]'
                    : ''
                }
                onClick={() => answer(true)}
              >
                {label}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
