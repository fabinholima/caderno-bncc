'use client';

import { useState } from 'react';
import { ALargeSmall, Moon, Sun } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

import { fontKey, maxFontScale, themeKey } from '@/lib/display-preferences';

// Preferências de leitura do portal: tema escuro e tamanho da fonte.
// Ficam salvas no navegador e são aplicadas no <html> antes da primeira
// pintura pelo script de app/layout.tsx (displayPreferencesScript).

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Navegação privada ou armazenamento bloqueado: vale só nesta página.
  }
}

// compact: um único botão abre o painel com os três controles, para o
// cabeçalho do portal não ficar com uma fileira de botões (sobretudo no celular).
export function DisplayPreferences({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  // O script do layout já aplicou as preferências ao <html>; o componente só
  // aparece depois do login (no navegador), então lê o estado direto do DOM.
  const [dark, setDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  );
  const [fontScale, setFontScale] = useState(() =>
    typeof document === 'undefined'
      ? 0
      : Math.min(
          maxFontScale,
          Math.max(0, Number(document.documentElement.dataset.fontScale) || 0),
        ),
  );

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    save(themeKey, next ? 'dark' : 'light');
    setDark(next);
  }

  function changeFont(delta: number) {
    const next = Math.min(maxFontScale, Math.max(0, fontScale + delta));
    const root = document.documentElement;
    if (next) root.dataset.fontScale = String(next);
    else delete root.dataset.fontScale;
    save(fontKey, String(next));
    setFontScale(next);
  }

  const button =
    'grid size-10 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

  const controls = (
    <fieldset className={`flex items-center gap-1 ${compact ? '' : className}`}>
      <legend className="sr-only">Preferências de leitura</legend>
      <button
        type="button"
        className={button}
        onClick={() => changeFont(-1)}
        disabled={fontScale === 0}
        aria-label="Diminuir o tamanho da fonte"
        title="Diminuir fonte"
      >
        A−
      </button>
      <button
        type="button"
        className={button}
        onClick={() => changeFont(1)}
        disabled={fontScale === maxFontScale}
        aria-label="Aumentar o tamanho da fonte"
        title="Aumentar fonte"
      >
        A+
      </button>
      <button
        type="button"
        className={button}
        onClick={toggleTheme}
        aria-pressed={dark}
        aria-label="Modo escuro"
        title={dark ? 'Usar modo claro' : 'Usar modo escuro'}
      >
        {dark ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )}
      </button>
    </fieldset>
  );
  if (!compact) return controls;
  return (
    <Popover>
      <PopoverTrigger
        className={`grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 data-[popup-open]:bg-slate-100 ${className}`}
        aria-label="Preferências de leitura"
        title="Tamanho da fonte e tema"
      >
        <ALargeSmall className="size-[18px]" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto gap-2 p-3">
        <p className="text-sm font-semibold text-slate-700">Leitura</p>
        {controls}
      </PopoverContent>
    </Popover>
  );
}
