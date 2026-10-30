import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  FileStack,
  FileUp,
  GraduationCap,
  Layers3,
  Plus,
  Printer,
  ScanLine,
  School,
  Sprout,
} from 'lucide-react';
import { Fraunces } from 'next/font/google';
import Link from 'next/link';
import './landing.css';
import Pricing from './pricing';

// Serifada de exibição para os destaques em itálico da página inicial.
const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-display',
});

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


const disciplines = [
  'Matemática',
  'Língua Portuguesa',
  'Química',
  'Física',
  'Biologia',
  'História',
  'Geografia',
  'Língua Inglesa',
  'Ciências',
  'Arte',
  'Filosofia',
  'Sociologia',
  'Educação Física',
];

const journey = [
  {
    icon: BookOpen,
    name: 'Preparar',
    title: 'Monte a prova em minutos',
    text: 'Escolha questões do seu acervo, organizado por disciplina e habilidade da BNCC, e gere versões embaralhadas para a turma.',
  },
  {
    icon: ScanLine,
    name: 'Corrigir',
    title: 'Corrija sem pilha de papel',
    text: 'Cada cartão-resposta tem um QR code. Fotografe com o celular ou envie o PDF digitalizado; leituras duvidosas vão para a sua revisão.',
  },
  {
    icon: BarChart3,
    name: 'Diagnosticar',
    title: 'Veja o que a turma aprendeu',
    text: 'Resultados por aluno, por questão e por habilidade da BNCC, prontos para exportar em planilha.',
  },
  {
    icon: Sprout,
    name: 'Recuperar',
    title: 'Planeje o próximo passo',
    text: 'Identifique as habilidades que pedem reforço e prepare a nova avaliação a partir delas.',
  },
];

const features = [
  {
    icon: BookOpen,
    title: 'Acervo organizado pela BNCC',
    text: 'Questões com habilidade, objeto de conhecimento, dificuldade e resolução. Encontre tudo com poucos filtros.',
  },
  {
    icon: FileUp,
    title: 'Traga suas provas antigas',
    text: 'Importe PDFs e deixe a leitura assistida separar as questões. Nada entra no acervo sem a sua revisão.',
  },
  {
    icon: Layers3,
    title: 'Várias versões da mesma prova',
    text: 'Questões e alternativas embaralhadas com o gabarito preservado em cada versão.',
  },
  {
    icon: Printer,
    title: 'Diagramação caprichada',
    text: 'Fórmulas, imagens e estruturas químicas em PDF com layouts de impressão profissionais.',
  },
  {
    icon: ScanLine,
    title: 'Cartão-resposta inteligente',
    text: 'O QR code identifica o aluno e a versão. Você só confere o que a leitura não teve certeza.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios que orientam',
    text: 'Acompanhe a evolução por habilidade e exporte os resultados da turma em planilha.',
  },
];

const faq = [
  [
    'Preciso instalar alguma coisa?',
    'Não. O UfaProva funciona no navegador. Para corrigir, você pode fotografar os cartões-resposta com o celular ou enviar um PDF digitalizado.',
  ],
  [
    'Serve para qualquer disciplina e série?',
    'Sim. O acervo cobre o Ensino Fundamental e o Ensino Médio, com as habilidades da BNCC de cada componente curricular.',
  ],
  [
    'Posso usar as minhas próprias questões?',
    'Pode e deve. Cadastre questões novas ou importe provas em PDF. As sugestões da leitura assistida só entram no acervo depois que você revisar.',
  ],
  [
    'Como funciona a correção automática?',
    'Cada aluno recebe um cartão-resposta com QR code, que identifica a pessoa e a versão da prova. Respostas em branco, duplas ou duvidosas seguem para revisão antes da nota final.',
  ],
  [
    'Os dados dos alunos ficam seguros?',
    'Cada escola acessa somente os próprios dados. Senhas e códigos de acesso são guardados de forma protegida e o CPF não é armazenado em texto aberto. Os detalhes estão na política de privacidade.',
  ],
  [
    'Posso cancelar quando quiser?',
    'Sim. A assinatura é gerenciada dentro do portal e o pagamento é processado com segurança pelo Mercado Pago.',
  ],
];

function ExamPreview() {
  return (
    <div className="ufa-showcase-art" aria-hidden="true">
      <div className="ufa-sheet">
        <div className="ufa-sheet-head">
          <div>
            <strong>Avaliação de Matemática</strong>
            <span>9º ano · Turma A · Versão B</span>
          </div>
          <div className="ufa-qr">
            {Array.from({ length: 25 }, (_, i) => (
              <i key={i} className={[0, 1, 3, 5, 6, 8, 12, 14, 16, 18, 19, 21, 23, 24].includes(i) ? 'on' : ''} />
            ))}
          </div>
        </div>
        <p className="ufa-sheet-line">Nome: ______________________________</p>
        <div className="ufa-q">
          <b>1.</b>
          <div>
            <p>Resolva a equação e assinale a alternativa correta:</p>
            <p className="ufa-formula">
              x² − 5x + 6 = 0
            </p>
            <ol>
              <li>(A) x = 1 ou x = 6</li>
              <li>(B) x = 2 ou x = 3</li>
              <li>(C) x = −2 ou x = −3</li>
              <li>(D) x = 5 ou x = 6</li>
            </ol>
          </div>
        </div>
        <div className="ufa-q">
          <b>2.</b>
          <div>
            <p>Um retângulo tem perímetro 30 cm e um lado de 9 cm. Qual é a sua área?</p>
            <div className="ufa-lines" />
          </div>
        </div>
        <span className="ufa-sheet-tag">EF09MA09</span>
      </div>
      <div className="ufa-card">
        <strong>Cartão-resposta</strong>
        {['A', 'B', 'C', 'D', 'E'].map((row, r) => (
          <div key={row} className="ufa-bubbles">
            <span>{r + 1}</span>
            {['A', 'B', 'C', 'D', 'E'].map((option, c) => (
              <i key={option} className={c === [1, 3, 0, 2, 4][r] ? 'on' : ''} />
            ))}
          </div>
        ))}
      </div>
      <div className="ufa-report">
        <strong>Por habilidade</strong>
        {[
          ['EF09MA09', 86],
          ['EF09MA06', 64],
          ['EF09MA02', 41],
        ].map(([code, value]) => (
          <div key={code}>
            <span>{code}</span>
            <div className="ufa-bar">
              <i style={{ width: `${value}%` }} />
            </div>
            <b>{value}%</b>
          </div>
        ))}
        <small>Exemplo ilustrativo</small>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className={`ufa ${display.variable}`}>
      <a className="ufa-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="ufa-header">
        <div className="ufa-wrap ufa-header-inner">
          <Link href="/" className="ufa-logo" aria-label="UfaProva, início">
            <b className="ufa-mark">u.</b>ufa<span>prova</span>
            <i>✳</i>
          </Link>
          <nav aria-label="Navegação principal">
            <a href="#como-funciona">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className="ufa-header-actions">
            <Link className="ufa-login" href="/portal">
              Entrar
            </Link>
            <Link className="ufa-cta ufa-cta-sm" href="/portal">
              Começar grátis
            </Link>
          </div>
        </div>
      </header>
      <main id="conteudo">
        <section className="ufa-wrap ufa-hero">
          <div className="ufa-hero-text">
            <p className="ufa-pill">
              <span /> Alinhado à BNCC · Ensino Fundamental e Médio
            </p>
            <h1>
              Menos tempo montando provas. <em>Mais vida lá fora.</em>
            </h1>
            <p className="ufa-intro">
              Prepare, corrija e acompanhe suas avaliações em um só lugar. Do banco de
              questões ao PDF impresso, da leitura do cartão-resposta ao diagnóstico da
              turma.
            </p>
            <div className="ufa-hero-actions">
              <Link className="ufa-cta" href="/portal">
                Começar grátis por 7 dias <ArrowUpRight size={20} />
              </Link>
              <a className="ufa-ghost" href="#como-funciona">
                Ver como funciona
              </a>
            </div>
            <ul className="ufa-checks">
              <li>
                <Check size={16} /> PDF pronto para imprimir
              </li>
              <li>
                <Check size={16} /> Correção pelo celular
              </li>
              <li>
                <Check size={16} /> Relatórios por habilidade
              </li>
            </ul>
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
          </div>
        </section>

        <div className="ufa-marquee" aria-label="Disciplinas atendidas">
          <div className="ufa-marquee-track">
            {[...disciplines, ...disciplines].map((name, i) => (
              <span key={`${name}-${i}`} aria-hidden={i >= disciplines.length}>
                {name} <i>✦</i>
              </span>
            ))}
          </div>
        </div>

        <section className="ufa-wrap ufa-section" id="como-funciona">
          <div className="ufa-heading ufa-heading-center">
            <p className="ufa-eyebrow">DA PRIMEIRA QUESTÃO À ÚLTIMA NOTA</p>
            <h2>
              A prova é só o começo. <em>A gente cuida do resto.</em>
            </h2>
            <p>
              Quatro etapas conectadas, do jeito que a avaliação acontece na escola.
            </p>
          </div>
          <ol className="ufa-journey">
            {journey.map(({ icon: Icon, name, title, text }, i) => (
              <li key={name}>
                <div className="ufa-journey-top">
                  <span className="ufa-journey-icon">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <span className="ufa-journey-num">0{i + 1}</span>
                </div>
                <p className="ufa-journey-name">{name}</p>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="ufa-showcase">
          <div className="ufa-wrap ufa-showcase-inner">
            <div className="ufa-showcase-text">
              <p className="ufa-eyebrow">FEITA PARA O PAPEL</p>
              <h2>
                Uma prova que dá <em>orgulho de entregar.</em>
              </h2>
              <p>
                Cabeçalho da escola, fórmulas bem diagramadas e um cartão-resposta que
                se corrige pelo celular. Depois, cada resposta vira informação sobre o
                que a turma já domina.
              </p>
              <ul>
                <li>
                  <Check size={18} /> Layouts de impressão para cada ocasião
                </li>
                <li>
                  <Check size={18} /> Versões diferentes para a mesma turma
                </li>
                <li>
                  <Check size={18} /> QR code que identifica aluno e versão
                </li>
              </ul>
            </div>
            <ExamPreview />
          </div>
        </section>

        <section className="ufa-wrap ufa-section" id="recursos">
          <div className="ufa-heading">
            <div>
              <p className="ufa-eyebrow">UM RESPIRO NA ROTINA</p>
              <h2>
                A parte trabalhosa? <em>Deixa com a gente.</em>
              </h2>
            </div>
            <p>
              Você cuida das escolhas pedagógicas. O UfaProva ajuda a colocar tudo no
              papel e a entender os resultados.
            </p>
          </div>
          <div className="ufa-features">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="ufa-feature-icon">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ufa-wrap ufa-audience">
          <article>
            <span className="ufa-feature-icon">
              <GraduationCap size={24} strokeWidth={1.6} />
            </span>
            <p className="ufa-eyebrow">PARA PROFESSORES</p>
            <h3>Seu acervo, suas turmas, seu tempo de volta.</h3>
            <ul>
              <li>
                <Check size={17} /> Banco pessoal de questões com a BNCC
              </li>
              <li>
                <Check size={17} /> Avaliações e correções de todas as turmas
              </li>
              <li>
                <Check size={17} /> Diagnóstico para planejar a recuperação
              </li>
            </ul>
          </article>
          <article className="ufa-audience-dark">
            <span className="ufa-feature-icon">
              <School size={24} strokeWidth={1.6} />
            </span>
            <p className="ufa-eyebrow">PARA ESCOLAS E COORDENAÇÃO</p>
            <h3>Toda a equipe trabalhando na mesma direção.</h3>
            <ul>
              <li>
                <Check size={17} /> Banco de questões compartilhado entre professores
              </li>
              <li>
                <Check size={17} /> Turmas, alunos e convites em um só lugar
              </li>
              <li>
                <Check size={17} /> Revisão e aprovação das questões pela coordenação
              </li>
            </ul>
          </article>
        </section>

        <Pricing />

        <section className="ufa-wrap ufa-section ufa-faq" id="duvidas">
          <div className="ufa-heading ufa-heading-center">
            <p className="ufa-eyebrow">DÚVIDAS FREQUENTES</p>
            <h2>
              Perguntou, <em>respondemos.</em>
            </h2>
          </div>
          <div className="ufa-faq-list">
            {faq.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={20} aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="ufa-wrap">
          <div className="ufa-final">
            <FileStack className="ufa-final-icon" size={34} strokeWidth={1.4} aria-hidden="true" />
            <h2>
              A próxima prova fica pronta. <em>O fim de semana fica seu.</em>
            </h2>
            <p>Experimente por 7 dias e prepare sua primeira avaliação hoje.</p>
            <Link className="ufa-cta ufa-cta-light" href="/portal">
              Começar agora <ArrowUpRight size={20} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="ufa-footer">
        <div className="ufa-wrap ufa-footer-inner">
          <div className="ufa-footer-brand">
            <Link href="/" className="ufa-logo">
              <b className="ufa-mark">u.</b>ufa<span>prova</span>
            </Link>
            <p>Mais tempo para ensinar. E para você.</p>
          </div>
          <nav aria-label="Produto">
            <strong>Produto</strong>
            <a href="#como-funciona">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <nav aria-label="Conta">
            <strong>Conta</strong>
            <Link href="/portal">Entrar</Link>
            <Link href="/portal">Criar conta</Link>
          </nav>
          <nav aria-label="Informações legais">
            <strong>Institucional</strong>
            <Link href="/privacidade">Política de privacidade</Link>
            <Link href="/contato">Contato</Link>
          </nav>
        </div>
        <div className="ufa-wrap ufa-footer-bottom">
          <span>© {new Date().getFullYear()} UfaProva</span>
          <span>Feito com carinho para quem ensina.</span>
        </div>
      </footer>
    </div>
  );
}
