'use client';

import { useMemo, useState } from 'react';
import { Check, FileOutput, GripVertical, Layers3, Printer, Shuffle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type BuilderQuestion = { id: string; code: string; statement: string; subject: string; grade: string; skill: string; difficulty: string };

export function AssessmentBuilder({ questions, apiUrl }: { questions: BuilderQuestion[]; apiUrl: string }) {
  const [selected, setSelected] = useState(() => new Set(questions.slice(0, 3).map((question) => question.id)));
  const [versions, setVersions] = useState(3);
  const [title, setTitle] = useState('Avaliação bimestral — Matemática');
  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedVersions, setGeneratedVersions] = useState<Array<{ code: string; renderJobId?: string }>>([]);
  const chosen = useMemo(() => questions.filter((question) => selected.has(question.id)), [questions, selected]);

  function toggle(id: string) {
    setGenerated(false);
    setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function generate() {
    if (!chosen.length) return setMessage('Selecione pelo menos uma questão.');
    setSaving(true); setMessage('');
    try {
      if (apiUrl && chosen.every((question) => /^[0-9a-f-]{36}$/i.test(question.id))) {
        const response = await fetch(`${apiUrl}/api/assessments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, subject: chosen[0].subject, grade: chosen[0].grade, questionIds: chosen.map((question) => question.id), versionCount: versions, instructions: ['Leia cada questão com atenção.', 'Marque apenas uma alternativa.'] }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Não foi possível gerar a avaliação.');
        setGeneratedVersions(body.data.versions);
        setMessage(`${body.data.versions.length} versões enviadas para a fila de PDF.`);
      } else {
        setGeneratedVersions(Array.from({ length: versions }, (_, index) => ({ code: String.fromCharCode(65 + index) })));
        setMessage(`${versions} versões preparadas. A prova modelo já pode ser baixada; a API produzirá os arquivos dinâmicos.`);
      }
      setGenerated(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro ao gerar avaliação.'); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-[1450px] px-5 py-7 sm:px-8 sm:py-9">
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="mb-1 text-xs font-bold uppercase tracking-[.15em] text-[var(--blue)]">Montagem e versões</p><h1 className="font-display text-3xl font-bold tracking-[-.03em] text-[var(--navy)] sm:text-[38px]">Nova avaliação</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Escolha questões, defina as versões e envie uma fotografia imutável para a fila de composição tipográfica.</p></div><Badge className="w-fit border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700" variant="outline"><Check className="mr-1 size-3" />BNCC vinculada</Badge></div>
    <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><header className="border-b border-slate-200 p-5"><h2 className="font-display text-xl font-bold text-[var(--navy)]">1. Selecione as questões</h2><p className="mt-1 text-sm text-slate-500">{chosen.length} questões adicionadas à avaliação</p></header><div className="divide-y divide-slate-100">{questions.map((question) => <button key={question.id} onClick={() => toggle(question.id)} className={`flex w-full items-start gap-3 p-4 text-left transition hover:bg-blue-50/50 ${selected.has(question.id) ? 'bg-blue-50/40' : ''}`}><span className={`mt-1 grid size-5 shrink-0 place-items-center rounded border ${selected.has(question.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>{selected.has(question.id) && <Check className="size-3" />}</span><GripVertical className="mt-1 size-4 shrink-0 text-slate-300" /><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-blue-700">{question.code}</span><Badge variant="outline" className="border-violet-200 bg-violet-50 font-mono text-violet-700">{question.skill}</Badge><span className="text-xs text-slate-400">{question.difficulty}</span></div><p className="text-sm font-medium leading-5 text-slate-800">{question.statement}</p></div></button>)}</div></section>
      <aside className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-5 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><Layers3 className="size-5" /></span><div><h2 className="font-display text-lg font-bold text-[var(--navy)]">2. Configuração</h2><p className="text-xs text-slate-500">Conteúdo e impressão</p></div></div><label className="block"><span className="mb-2 block text-sm font-semibold">Título</span><Input value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="mt-4 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">Versões</span><select value={versions} onChange={(event) => setVersions(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="1">A</option><option value="2">A e B</option><option value="3">A, B e C</option><option value="4">A até D</option></select></label><label><span className="mb-2 block text-sm font-semibold">Papel</span><select className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option>A4</option></select></label></div><div className="mt-5 rounded-xl border border-violet-100 bg-violet-50 p-4"><div className="flex gap-3"><Shuffle className="mt-0.5 size-4 shrink-0 text-violet-600" /><div><p className="text-sm font-semibold text-violet-900">Embaralhamento determinístico</p><p className="mt-1 text-xs leading-5 text-violet-700">Cada versão recebe ordem própria de questões e alternativas, preservando o gabarito por chave estável.</p></div></div></div><Button onClick={generate} disabled={saving || !title.trim()} className="mt-5 w-full bg-[var(--blue)] text-white hover:bg-blue-700"><Sparkles />{saving ? 'Preparando...' : `Gerar ${versions} ${versions === 1 ? 'versão' : 'versões'}`}</Button>{message && <p role="status" className="mt-3 text-xs leading-5 text-slate-600">{message}</p>}</section>
        {generated && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 text-emerald-800"><Check className="size-5" /><h3 className="font-semibold">Avaliação congelada</h3></div><div className="mt-4 flex gap-2">{generatedVersions.map((version) => <span key={version.code} className="grid size-9 place-items-center rounded-lg bg-white font-mono text-sm font-bold text-emerald-800 shadow-sm">{version.code}</span>)}</div><p className="mt-3 text-xs leading-5 text-emerald-700">O worker produz, para cada versão, uma prova do aluno e um gabarito do professor.</p><div className="mt-4 grid grid-cols-2 gap-2"><a href={generatedVersions[0]?.renderJobId ? `${apiUrl}/api/render-jobs/${generatedVersions[0].renderJobId}/prova` : '/generated/avaliacao-modelo.pdf'} download className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-emerald-100"><Printer className="size-4" />Baixar prova</a><a href={generatedVersions[0]?.renderJobId ? `${apiUrl}/api/render-jobs/${generatedVersions[0].renderJobId}/gabarito` : '/generated/avaliacao-modelo.pdf'} download className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-emerald-100"><FileOutput className="size-4" />Gabarito</a></div></section>}
      </aside>
    </div>
  </div>;
}
