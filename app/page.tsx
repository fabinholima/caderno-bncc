import { ArrowUpRight, BookOpen, Layers3, FileCheck2 } from 'lucide-react';
import './landing.css';
import Pricing from './pricing';
import Link from 'next/link';

export const metadata = {
  title: 'UfaProva — Mais tempo para ensinar. E para você.',
  description:
    'Organize questões, prepare avaliações alinhadas à BNCC e gere provas prontas para imprimir.',
};

function Mimeograph() {
  return (
    <svg
      className="machine"
      viewBox="0 0 600 480"
      // SVG is the native accessible image container for this inline illustration.
      aria-labelledby="mimeograph-title"
    >
      <title id="mimeograph-title">
        Mimeógrafo clássico com manivela girando e uma avaliação saindo em papel
      </title>
      <defs>
        <linearGradient id="roller" x2="0" y2="1">
          <stop stopColor="#e4dceb" />
          <stop offset=".5" stopColor="#b29acb" />
          <stop offset="1" stopColor="#806594" />
        </linearGradient>
      </defs>
      <ellipse cx="305" cy="427" rx="222" ry="20" fill="#233c3b" opacity=".1" />
      <path
        d="m120 305 277-8 127 107-326 19Z"
        fill="#bea7cb"
        stroke="#273e49"
        strokeWidth="3"
      />
      <path
        d="m198 423 326-19v13l-326 19-78-117v-14Z"
        fill="#324b58"
        stroke="#273e49"
        strokeWidth="3"
      />
      <g className="printed-sheet">
        <path
          d="m213 283 190-5 77 117-228 11Z"
          fill="#fffdf6"
          stroke="#ddd3c4"
          strokeWidth="2"
        />
        <g fill="#765891" fontFamily="Arial,sans-serif">
          <text x="243" y="325" fontSize="12" fontWeight="bold">
            AVALIAÇÃO · TURMA A
          </text>
          <text x="257" y="349" fontSize="9">
            01. O conhecimento transforma.
          </text>
          <text x="274" y="375" fontSize="12">
            Ⓐ Ⓑ Ⓒ Ⓓ Ⓔ
          </text>
        </g>
        <path d="m244 332 163-3m-138 24 153-3" stroke="#d7c9df" />
      </g>
      <path
        d="m135 213 276-8 30 111-307 13Z"
        fill="#334d5b"
        stroke="#203643"
        strokeWidth="4"
      />
      <path d="m155 225 238-6 19 59-264 9Z" fill="#7b8b96" />
      <path d="m152 256 255-7" stroke="#d1d6d8" strokeWidth="5" />
      <path d="m135 307 302-11 4 20-307 13Z" fill="#1a303c" />
      <path
        d="M141 216v-94q0-17 20-17h238v105Z"
        fill="#c5b3d4"
        stroke="#273e49"
        strokeWidth="4"
      />
      <path
        d="m169 116 29-81 187-5 28 80Z"
        fill="#405967"
        stroke="#273e49"
        strokeWidth="4"
      />
      <path
        d="m190 108 20-65 163-4 22 63Z"
        fill="#fffaf0"
        stroke="#d7cfbf"
        strokeWidth="2"
      />
      <path
        d="m220 61 124-3m-128 19 138-4m-143 21 86-3"
        stroke="#c0acd1"
        strokeWidth="3"
      />
      <path
        d="M171 122h217v103H171Z"
        fill="url(#roller)"
        stroke="#344550"
        strokeWidth="3"
      />
      <ellipse
        cx="171"
        cy="173"
        rx="31"
        ry="51"
        fill="#3c5461"
        stroke="#203643"
        strokeWidth="4"
      />
      <ellipse
        cx="388"
        cy="173"
        rx="31"
        ry="51"
        fill="#c5b3d4"
        stroke="#344550"
        strokeWidth="3"
      />
      <path
        className="roller-line"
        d="M175 145h209"
        stroke="#f7edf9"
        strokeWidth="3"
      />
      <circle cx="388" cy="173" r="13" fill="#405967" />
      <path
        d="M401 173h38"
        stroke="#233b49"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <g className="crank">
        <path
          d="M439 173v53h37"
          fill="none"
          stroke="#344d5b"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="465"
          y="212"
          width="45"
          height="27"
          rx="12"
          fill="#9677af"
          stroke="#263d49"
          strokeWidth="3"
        />
      </g>
      <rect
        x="224"
        y="265"
        width="98"
        height="25"
        rx="4"
        fill="#e3d8be"
        transform="rotate(-2 224 265)"
      />
      <text
        x="239"
        y="282"
        fontFamily="Georgia,serif"
        fontSize="16"
        fill="#263d49"
      >
        ufa, prova!
      </text>
      <path
        d="m172 428-3 13m303-22 4 12"
        stroke="#1c3340"
        strokeWidth="12"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="ufa">
      <a className="ufa-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ufa-wrap ufa-header">
        <Link href="/" className="ufa-logo" aria-label="UfaProva, início">
          <b className="ufa-mark">u.</b>ufa<span>prova</span>
          <i>✳</i>
        </Link>
        <nav aria-label="Navegação principal">
          <a href="#recursos">O que você pode fazer</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos e assinaturas</a>
        </nav>
        <Link
          className="ufa-login"
          href="/portal"
          prefetch={false}
          onClick={(event) => {
            event.preventDefault();
            window.location.assign('/portal');
          }}
        >
          Entrar <ArrowUpRight size={17} />
        </Link>
      </header>
      <main id="conteudo">
        <section className="ufa-wrap ufa-hero">
          <div>
            <p className="ufa-eyebrow">● &nbsp; FEITO PARA QUEM ENSINA</p>
            <h1>
              Menos tempo
              <br />
              montando provas.
              <br />
              <em>Mais vida lá fora.</em>
            </h1>
            <p className="ufa-intro">
              Sua próxima avaliação sem perder o fim de semana. Reúna questões,
              organize suas ideias e gere uma prova com a sua cara.
            </p>
            <Link className="ufa-cta" href="/portal">
              Montar minha avaliação <ArrowUpRight size={21} />
            </Link>
            <p className="ufa-small">
              Do banco de questões ao PDF pronto para imprimir.
            </p>
          </div>
          <div className="ufa-art">
            <div className="ufa-circle" />
            <p className="ufa-caption">
              Um clássico da escola.
              <br />
              <span>Uma nova forma de preparar provas.</span>
            </p>
            <Mimeograph />
            <div className="ufa-stamp">
              FEITA POR VOCÊ<strong>sem virar a noite.</strong>
            </div>
            <p className="ufa-note">
              O carinho de sempre. A praticidade de hoje.
            </p>
          </div>
        </section>
        <div className="ufa-ribbon">
          <div className="ufa-wrap">
            <em>Seu jeito de ensinar, em cada prova.</em>
            <span>✦ &nbsp; BNCC como referência</span>
            <span>✦ &nbsp; Diferentes disciplinas</span>
            <span>✦ &nbsp; PDF para imprimir</span>
          </div>
        </div>
        <section className="ufa-wrap ufa-section" id="recursos">
          <p className="ufa-eyebrow">UM RESPIRO NA ROTINA</p>
          <div className="ufa-heading">
            <h2>
              A parte trabalhosa?
              <br />
              <em>Deixa com a gente.</em>
            </h2>
            <p>
              Você cuida das escolhas pedagógicas.
              <br />O UfaProva ajuda a colocar tudo no papel.
            </p>
          </div>
          <div className="ufa-features">
            {[
              {
                icon: BookOpen,
                title: 'Seu acervo, organizado.',
                text: 'Cadastre questões e encontre o que precisa por disciplina, habilidade da BNCC e objeto de conhecimento.',
              },
              {
                icon: Layers3,
                title: 'Uma prova do seu jeito.',
                text: 'Combine disciplinas, selecione questões e prepare diferentes versões para sua turma.',
              },
              {
                icon: FileCheck2,
                title: 'Pronta para o papel.',
                text: 'Escolha o layout e gere um PDF com fórmulas, imagens e uma diagramação cuidada.',
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <div>
                  <Icon size={27} strokeWidth={1.5} />
                  <span>0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="ufa-how" id="como-funciona">
          <div className="ufa-wrap">
            <p className="ufa-eyebrow">DO PRIMEIRO CLIQUE À ÚLTIMA FOLHA</p>
            <h2>
              Três passos. <em>Um grande ufa.</em>
            </h2>
            <ol>
              {[
                [
                  'Escolha as questões',
                  'Busque no seu acervo ou cadastre uma nova ideia.',
                ],
                [
                  'Dê o seu toque',
                  'Organize as disciplinas e personalize a avaliação.',
                ],
                [
                  'Gere e imprima',
                  'Baixe o PDF e leve sua prova para a sala de aula.',
                ],
              ].map(([title, text], i) => (
                <li key={title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <Pricing />
        <section className="ufa-wrap ufa-bottom">
          <span>✳</span>
          <h2>
            A próxima prova fica pronta.
            <br />
            <em>O fim de semana fica seu.</em>
          </h2>
          <Link className="ufa-cta" href="/portal">
            Vamos preparar sua prova? <ArrowUpRight size={20} />
          </Link>
        </section>
      </main>
      <footer className="ufa-wrap ufa-footer">
        <Link href="/" className="ufa-logo">
          ufa<span>prova</span>
        </Link>
        <p>Mais tempo para ensinar. E para você.</p>
        <Link href="/portal">Acessar o portal ↗</Link>
        <nav aria-label="Informações legais" className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacidade">Política de privacidade</Link>
          <Link href="/contato">Contato</Link>
        </nav>
      </footer>
    </div>
  );
}
