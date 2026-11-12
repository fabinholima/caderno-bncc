import {
  elementPosition,
  formatAtomicMass,
  periodicElements,
} from '../../lib/periodic-table.mjs';

// Medidas da tabela no tamanho de projeto (largura útil do A4); o desenho é
// reduzido quando a área de texto é mais estreita, como no A5.
const CELL_WIDTH = 9.2;
const CELL_HEIGHT = 10.6;
const F_BLOCK_GAP = 4;

const mm = (value) => `${Number(value.toFixed(2))}mm`;
const point = (x, y) => `(${mm(x)},${mm(y)})`;
const text = (size, content, bold = false, anchor = '') =>
  `textext${anchor}("\\switchtobodyfont[${size}pt]${bold ? '\\bf ' : ''}${content}")`;

function cellOrigin(row, column) {
  const gap = row >= 8 ? F_BLOCK_GAP : 0;
  return {
    x: (column - 1) * CELL_WIDTH,
    y: -(row - 1) * CELL_HEIGHT - gap,
  };
}

function cellBox({ x, y }, fill = '') {
  const box = `unitsquare xscaled ${mm(CELL_WIDTH)} yscaled ${mm(CELL_HEIGHT)} shifted ${point(x, y - CELL_HEIGHT)}`;
  return `${fill ? `fill ${box} withcolor ${fill};\n` : ''}draw ${box} withpen pencircle scaled .35pt;`;
}

function elementCell([atomicNumber, symbol, mass]) {
  const { row, column } = elementPosition(atomicNumber);
  const origin = cellOrigin(row, column);
  const centerX = origin.x + CELL_WIDTH / 2;
  return [
    cellBox(origin),
    `draw ${text(5.5, atomicNumber)} shifted ${point(centerX, origin.y - 1.9)};`,
    `draw ${text(9, symbol, true)} shifted ${point(centerX, origin.y - 5.2)};`,
    `draw ${text(5, formatAtomicMass(mass))} shifted ${point(centerX, origin.y - 8.6)};`,
  ].join('\n');
}

// Onde cada grupo começa, para escrever o número do grupo acima da coluna.
const groupTopRow = (column) =>
  column === 1 || column === 18 ? 1 : column <= 2 || column >= 13 ? 2 : 4;

export function periodicTableMetaPost() {
  const commands = periodicElements.map(elementCell);
  for (let column = 1; column <= 18; column++) {
    const { x, y } = cellOrigin(groupTopRow(column), column);
    commands.push(
      `draw ${text(5.5, column)} shifted ${point(x + CELL_WIDTH / 2, y + 1.6)};`,
    );
  }
  for (let row = 1; row <= 7; row++) {
    const { y } = cellOrigin(row, 1);
    commands.push(
      `draw ${text(5.5, row)} shifted ${point(-2.2, y - CELL_HEIGHT / 2)};`,
    );
  }
  // Marcadores do bloco f na coluna do grupo 3 e rótulos das duas linhas.
  [
    [6, '57–71'],
    [7, '89–103'],
  ].forEach(([row, range]) => {
    const origin = cellOrigin(row, 3);
    commands.push(
      cellBox(origin, '.9white'),
      `draw ${text(5, range)} shifted ${point(origin.x + CELL_WIDTH / 2, origin.y - CELL_HEIGHT / 2)};`,
    );
  });
  [
    [8, 'Lantanídios'],
    [9, 'Actinídios'],
  ].forEach(([row, label]) => {
    const { x, y } = cellOrigin(row, 3);
    commands.push(
      `draw ${text(6, label, false, '.lft')} shifted ${point(x - 1, y - CELL_HEIGHT / 2)};`,
    );
  });
  // Legenda no vão sobre os metais de transição.
  const legend = cellOrigin(1, 6);
  const legendX = legend.x + CELL_WIDTH / 2;
  commands.push(
    cellBox(legend),
    `draw ${text(5.5, 'Z')} shifted ${point(legendX, legend.y - 1.9)};`,
    `draw ${text(9, 'X', true)} shifted ${point(legendX, legend.y - 5.2)};`,
    `draw ${text(5, 'massa')} shifted ${point(legendX, legend.y - 8.6)};`,
    ...[
      [2.4, 'Z: número atômico'],
      [5.3, 'X: símbolo do elemento'],
      [8.2, 'massa: massa atômica (u)'],
    ].map(
      ([offset, label]) =>
        `draw ${text(6, label, false, '.rt')} shifted ${point(legendX + CELL_WIDTH / 2 + 1, legend.y - offset)};`,
    ),
  );
  return `\\startMPcode
${commands.join('\n')}
if bbwidth(currentpicture) > TextWidth:
  currentpicture := currentpicture scaled (TextWidth / bbwidth(currentpicture));
fi;
\\stopMPcode`;
}

// Constantes usuais em provas (CODATA, arredondadas como nos vestibulares).
export const physicalConstants = Object.freeze([
  ['Aceleração da gravidade', 'g = 9\\mathord{,}8\\ \\mathrm{m/s^2}'],
  [
    'Velocidade da luz no vácuo',
    'c = 3\\mathord{,}00 \\cdot 10^{8}\\ \\mathrm{m/s}',
  ],
  [
    'Constante de Planck',
    'h = 6\\mathord{,}63 \\cdot 10^{-34}\\ \\mathrm{J \\cdot s}',
  ],
  ['Carga elementar', 'e = 1\\mathord{,}60 \\cdot 10^{-19}\\ \\mathrm{C}'],
  [
    'Constante eletrostática',
    'k = 8\\mathord{,}99 \\cdot 10^{9}\\ \\mathrm{N \\cdot m^2/C^2}',
  ],
  [
    'Permissividade do vácuo',
    '\\varepsilon_0 = 8\\mathord{,}85 \\cdot 10^{-12}\\ \\mathrm{F/m}',
  ],
  [
    'Permeabilidade do vácuo',
    '\\mu_0 = 4\\pi \\cdot 10^{-7}\\ \\mathrm{T \\cdot m/A}',
  ],
  [
    'Constante gravitacional',
    'G = 6\\mathord{,}67 \\cdot 10^{-11}\\ \\mathrm{N \\cdot m^2/kg^2}',
  ],
  ['Massa do elétron', 'm_e = 9\\mathord{,}11 \\cdot 10^{-31}\\ \\mathrm{kg}'],
  ['Massa do próton', 'm_p = 1\\mathord{,}67 \\cdot 10^{-27}\\ \\mathrm{kg}'],
  [
    'Elétron-volt',
    '1\\ \\mathrm{eV} = 1\\mathord{,}60 \\cdot 10^{-19}\\ \\mathrm{J}',
  ],
  ['Caloria', '1\\ \\mathrm{cal} = 4\\mathord{,}18\\ \\mathrm{J}'],
  [
    'Constante de Avogadro',
    'N_A = 6\\mathord{,}02 \\cdot 10^{23}\\ \\mathrm{mol^{-1}}',
  ],
  [
    'Constante de Boltzmann',
    'k_B = 1\\mathord{,}38 \\cdot 10^{-23}\\ \\mathrm{J/K}',
  ],
  [
    'Constante dos gases',
    'R = 8\\mathord{,}31\\ \\mathrm{J/(mol \\cdot K)} = 0\\mathord{,}082\\ \\mathrm{atm \\cdot L/(mol \\cdot K)}',
  ],
  ['Constante de Faraday', 'F = 96\\,500\\ \\mathrm{C/mol}'],
  ['Volume molar (0 °C e 1 atm)', 'V_m = 22\\mathord{,}4\\ \\mathrm{L/mol}'],
  [
    'Pressão atmosférica',
    '1\\ \\mathrm{atm} = 1\\mathord{,}01 \\cdot 10^{5}\\ \\mathrm{Pa} = 760\\ \\mathrm{mmHg}',
  ],
  ['Densidade da água', '\\rho = 1\\mathord{,}0\\ \\mathrm{g/cm^3}'],
  [
    'Calor específico da água',
    'c = 1\\mathord{,}0\\ \\mathrm{cal/(g \\cdot °C)} = 4\\mathord{,}18\\ \\mathrm{J/(g \\cdot °C)}',
  ],
  ['Zero absoluto', '0\\ \\mathrm{K} = -273\\mathord{,}15\\ \\mathrm{°C}'],
]);

export function physicalConstantsTable() {
  const rows = physicalConstants
    .map(([name, value]) => `\\NC ${name} \\NC $${value}$ \\NC\\NR`)
    .join('\n');
  return `{\\switchtobodyfont[small]
\\starttabulate[|p(.38\\textwidth)|p|]
\\HL
${rows}
\\HL
\\stoptabulate}`;
}

// Página de anexo ao fim do caderno do aluno, antes do cartão-resposta.
export function renderScienceAppendix({ periodicTable, constants }) {
  if (!periodicTable && !constants) return '';
  const parts = [];
  if (periodicTable)
    parts.push(
      `\\subject{Tabela periódica dos elementos}\n\\blank[small]\n\\startalignment[middle]\n${periodicTableMetaPost()}\n\\stopalignment\n\\blank[small]\n{\\switchtobodyfont[small]Massas atômicas com duas casas decimais. Entre parênteses, o número de massa do isótopo mais estável dos elementos sem massa atômica padrão.}`,
    );
  if (constants)
    parts.push(
      `\\subject{Constantes físicas e químicas}\n${physicalConstantsTable()}`,
    );
  return `\\page\n${parts.join('\n\\blank[medium]\n')}`;
}
