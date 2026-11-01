'use client';
/* oxlint-disable next/no-html-link-for-pages -- No app publicado (vinext), o <Link> do Next não navega: o clique fica na mesma página ("RSC prefetch setup error"). Use <a> com navegação completa. */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

type Prices = Record<string, { monthly: number; annual: number }>;
const initialPrices: Prices = {
  professor: { monthly: 4990, annual: 49900 },
  escola: { monthly: 19990, annual: 199900 },
};
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const plans = [
  {
    name: 'Experimentar',
    monthly: 'Grátis',
    yearly: 'Grátis',
    description: 'Conheça uma rotina com menos trabalho.',
    features: [
      '7 dias para experimentar',
      '1 professor',
      '3 avaliações no período',
      'Até 30 questões cadastradas',
      'Até 2 versões por avaliação',
      '10 questões extraídas com IA no período',
    ],
    action: 'Sobre o período gratuito',
  },
  {
    name: 'Professor',
    monthly: 'R$ 49,90',
    yearly: 'R$ 499',
    description: 'Seu acervo e suas provas, do seu jeito.',
    features: [
      '1 professor e suas turmas',
      '30 avaliações por mês',
      'Cadastro manual sem limite de quantidade¹',
      'Até 5 versões por avaliação',
      '100 questões extraídas com IA por mês',
      'Todos os layouts de PDF',
    ],
    action: 'Sobre a assinatura Professor',
  },
  {
    name: 'Escola',
    monthly: 'R$ 199,90',
    yearly: 'R$ 1.999',
    description: 'Mais colaboração para toda a equipe.',
    features: [
      'Até 10 professores',
      '200 avaliações por mês, compartilhadas',
      'Banco de questões compartilhado',
      'Até 10 versões por avaliação',
      '500 questões extraídas com IA por mês',
      'Coordenação e gestão de turmas',
    ],
    action: 'Sobre a assinatura Escola',
  },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [prices, setPrices] = useState<Prices>(initialPrices);
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    let active = true;
    apiFetch(`${apiUrl}/api/public/billing-plans`).then(async (response) => {
      const body = await response.json() as { data?: { id: string; monthly: number; annual: number }[] };
      if (!response.ok || !body.data) return;
      const updated = Object.fromEntries(body.data.map((plan) => [plan.id, { monthly: plan.monthly, annual: plan.annual }]));
      if (active) setPrices((current) => ({ ...current, ...updated }));
    }).catch(() => { /* Keep the published fallback while the API is unavailable. */ });
    return () => { active = false; };
  }, []);
  const monthlyProfessor = prices.professor?.monthly || initialPrices.professor.monthly;
  const annualProfessor = prices.professor?.annual || initialPrices.professor.annual;
  const annualSavings = Math.max(0, Math.round((1 - annualProfessor / (monthlyProfessor * 12)) * 100));
  const displayPlans = plans.map((plan) => {
    const id = plan.name.toLowerCase();
    if (id === 'professor' || id === 'escola') return { ...plan, monthly: money(prices[id]?.monthly || initialPrices[id].monthly), yearly: money(prices[id]?.annual || initialPrices[id].annual) };
    return plan;
  });
  return (
    <section
      className="ufa-wrap ufa-section ufa-pricing"
      id="planos"
      aria-labelledby="plans-heading"
    >
      <p className="ufa-eyebrow">UM PLANO PARA CADA ROTINA</p>
      <div className="ufa-heading">
        <h2 id="plans-heading">
          Mais tempo para você.
          <br />
          <em>Escolha como começar.</em>
        </h2>
        <fieldset
          className="ufa-billing m-0 min-w-0 border-0 p-0"
          aria-label="Periodicidade de pagamento"
        >
          <button
            type="button"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            Mensal
          </button>
          <button
            type="button"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            Anual <span className="ufa-saving">Economize {annualSavings}%</span>
          </button>
        </fieldset>
      </div>
      <p className="ufa-plan-notice">
        Assinaturas disponíveis. Crie sua conta ou entre no portal para escolher
        o plano e concluir o pagamento com segurança no Mercado Pago.
      </p>
      <div className="ufa-plan-grid">
        {displayPlans.map((plan, index) => (
          <article
            key={plan.name}
            className={`ufa-plan ${index === 1 ? 'ufa-plan-featured' : ''}`}
          >
            {index === 1 && (
              <span className="ufa-recommended">
                ✦ Recomendado para professores
              </span>
            )}
            <p className="ufa-eyebrow">
              {
                ['PARA CONHECER', 'PARA SUA ROTINA', 'PARA TODA A EQUIPE'][
                  index
                ]
              }
            </p>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <div className="ufa-price">
              {annual ? plan.yearly : plan.monthly}
              <span>
                {index === 0 ? ' / 7 dias' : annual ? ' / ano' : ' / mês'}
              </span>
            </div>
            <p className="ufa-price-note">
              {index === 0
                ? 'Conheça os recursos antes de escolher.'
                : annual
                  ? 'Pagamento anual único. Cotas renovadas mensalmente.'
                  : 'Valor mensal proposto para o lançamento.'}
            </p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <a
              className="ufa-cta"
              href="/portal"
            >
              {index === 0 ? 'Começar agora' : `Assinar plano ${plan.name}`}
            </a>
          </article>
        ))}
      </div>
      <div
        id="subscription-info"
        className="ufa-subscription-info"
        aria-live="polite"
      >
        <p>
          Os três planos incluem classificação BNCC e todos os layouts. A
          contratação é concluída dentro do portal, com confirmação segura no
          Mercado Pago.
        </p>
      </div>
      <details className="ufa-plan-rules">
        <summary>
          Regras simples, sem surpresas.{' '}
          <span>Entenda os limites e benefícios</span>
        </summary>
        <ul>
          <li>
            Várias versões da mesma prova contam como uma avaliação. Correções,
            novas renderizações e downloads não consomem outra avaliação.
          </li>
          <li>
            A cota de IA é por questão extraída, não por arquivo. Falhas de
            processamento não consomem créditos; questões importadas precisam de
            revisão.
          </li>
          <li>
            Escola: professor adicional proposto por R$ 12,90/mês. Atendimento
            institucional antes da contratação.
          </li>
          <li>
            ¹ O armazenamento de arquivos e imagens terá uma cota, a definir
            antes da abertura das assinaturas.
          </li>
        </ul>
      </details>
    </section>
  );
}
