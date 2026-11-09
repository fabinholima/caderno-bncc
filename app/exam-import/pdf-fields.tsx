import { useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type PdfPreview, type StoredPdfPreview } from './model';

export function PdfField({
  name,
  title,
  required = false,
  onFileSelected,
}: {
  name: string;
  title: string;
  required?: boolean;
  onFileSelected: (file: File | null) => void;
}) {
  // Campo de arquivo em português, com o nome do PDF escolhido. O <input>
  // invisível cobre toda a área: clicar ou soltar um PDF ali funciona.
  const [fileName, setFileName] = useState('');
  return (
    <label className="relative block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center transition focus-within:ring-2 focus-within:ring-blue-600 hover:bg-slate-100">
      <FileText className="mx-auto size-7 text-blue-700" aria-hidden="true" />
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">
        Arraste o PDF para cá ou clique para escolher (até 15 MB).
      </span>
      <span className="mt-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">
        {fileName ? 'Trocar arquivo' : 'Escolher PDF'}
      </span>
      <span
        className="mt-2 block truncate text-xs text-slate-600"
        aria-live="polite"
      >
        {fileName || 'Nenhum arquivo escolhido'}
      </span>
      <input
        name={name}
        type="file"
        accept="application/pdf,.pdf"
        required={required}
        aria-label={title}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] || null;
          setFileName(file?.name || '');
          onFileSelected(file);
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}

export function PdfPreviewCard({
  title,
  preview,
}: {
  title: string;
  preview: PdfPreview;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            {title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {(preview.size / 1_000_000).toFixed(1)} MB
        </span>
      </div>
      <iframe
        title={`Prévia do PDF: ${preview.name}`}
        src={`${preview.url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[520px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={preview.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          Abrir prévia em outra aba
        </a>
      </div>
    </article>
  );
}

export function StoredPdfPreviewCard({
  apiUrl,
  preview,
  onClose,
}: {
  apiUrl: string;
  preview: StoredPdfPreview;
  onClose: () => void;
}) {
  const url = `${apiUrl}/api/exam-imports/${preview.importId}/documents/${preview.documentId}/pdf`;
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-blue-200 bg-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Prévia após a importação · {preview.title}
          </p>
          <p className="truncate text-sm font-semibold text-slate-800">
            {preview.name} · {(preview.size / 1_000_000).toFixed(1)} MB
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar prévia"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <iframe
        title={`Prévia do PDF importado: ${preview.name}`}
        src={`${url}#toolbar=1&navpanes=0&view=FitH`}
        className="h-[620px] w-full bg-white"
      />
      <div className="border-t border-slate-200 bg-white px-4 py-2 text-right">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          Abrir PDF em outra aba
        </a>
      </div>
    </section>
  );
}
