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
// Cada linha é [nome, expressão em modo matemático]. As grandezas usam o
// \unit do ConTeXt (manual units-mkiv): vírgula decimal e ponto nos milhares
// na entrada (order=reverse), notação científica com e (3,00e8 → 3,00×10⁸),
// unidades por extenso (meter per square second → m/s²) e ^-1 para expoente
// negativo (mole^-1 → mol⁻¹).
export const physicalConstants = Object.freeze([
  ['Aceleração da gravidade', 'g = \\unit{9,8 meter per square second}'],
  ['Velocidade da luz no vácuo', 'c = \\unit{3,00e8 meter per second}'],
  ['Constante de Planck', 'h = \\unit{6,63e-34 joule second}'],
  ['Carga elementar', 'e = \\unit{1,60e-19 coulomb}'],
  [
    'Constante eletrostática',
    'k = \\unit{8,99e9 newton square meter per square coulomb}',
  ],
  [
    'Permissividade do vácuo',
    '\\varepsilon_0 = \\unit{8,85e-12 farad per meter}',
  ],
  [
    'Permeabilidade do vácuo',
    '\\mu_0 = 4\\pi \\cdot 10^{-7}\\,\\unit{tesla meter per ampere}',
  ],
  [
    'Constante gravitacional',
    'G = \\unit{6,67e-11 newton square meter per square kilogram}',
  ],
  ['Massa do elétron', 'm_e = \\unit{9,11e-31 kilogram}'],
  ['Massa do próton', 'm_p = \\unit{1,67e-27 kilogram}'],
  ['Elétron-volt', '\\unit{1 electronvolt} = \\unit{1,60e-19 joule}'],
  ['Caloria', '\\unit{1 calorie} = \\unit{4,18 joule}'],
  ['Constante de Avogadro', 'N_A = \\unit{6,02e23 mole^-1}'],
  ['Constante de Boltzmann', 'k_B = \\unit{1,38e-23 joule per kelvin}'],
  [
    'Constante dos gases',
    'R = \\unit{8,31 joule mole^-1 kelvin^-1} = \\unit{0,082 atmosphere liter mole^-1 kelvin^-1}',
  ],
  ['Constante de Faraday', 'F = \\unit{96.500 coulomb per mole}'],
  ['Volume molar (0 °C e 1 atm)', 'V_m = \\unit{22,4 liter per mole}'],
  [
    'Pressão atmosférica',
    '\\unit{1 atmosphere} = \\unit{1,01e5 pascal} = \\unit{760 mmHg}',
  ],
  ['Densidade da água', '\\rho = \\unit{1,0 gram per cubic centimeter}'],
  [
    'Calor específico da água',
    'c = \\unit{1,0 calorie gram^-1 degree celsius^-1} = \\unit{4,18 joule gram^-1 degree celsius^-1}',
  ],
  ['Zero absoluto', '\\unit{0 kelvin} = \\unit{-273,15 degree celsius}'],
]);

export function physicalConstantsTable() {
  const rows = physicalConstants
    .map(([name, value]) => `\\NC ${name} \\NC $${value}$ \\NC\\NR`)
    .join('\n');
  // method=5: espaço fino nos milhares e vírgula decimal na saída;
  // order=reverse: na entrada a vírgula é decimal e o ponto separa milhares.
  // Os ajustes valem só dentro deste grupo.
  return `{\\switchtobodyfont[small]
\\setupunit[method=5,order=reverse]
\\setupunittext[liter=L]
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
