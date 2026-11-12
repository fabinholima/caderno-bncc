// Tabela periódica usada no anexo das provas de Química e Física.
// Massas atômicas: valores padrão da IUPAC arredondados para duas casas
// decimais. Elementos sem massa atômica padrão (sem isótopo estável) trazem o
// número de massa do isótopo mais estável entre parênteses, como é usual.
// Formato: [número atômico, símbolo, massa].
export const periodicElements = Object.freeze([
  [1, 'H', 1.01],
  [2, 'He', 4.0],
  [3, 'Li', 6.94],
  [4, 'Be', 9.01],
  [5, 'B', 10.81],
  [6, 'C', 12.01],
  [7, 'N', 14.01],
  [8, 'O', 16.0],
  [9, 'F', 19.0],
  [10, 'Ne', 20.18],
  [11, 'Na', 22.99],
  [12, 'Mg', 24.31],
  [13, 'Al', 26.98],
  [14, 'Si', 28.09],
  [15, 'P', 30.97],
  [16, 'S', 32.06],
  [17, 'Cl', 35.45],
  [18, 'Ar', 39.95],
  [19, 'K', 39.1],
  [20, 'Ca', 40.08],
  [21, 'Sc', 44.96],
  [22, 'Ti', 47.87],
  [23, 'V', 50.94],
  [24, 'Cr', 52.0],
  [25, 'Mn', 54.94],
  [26, 'Fe', 55.85],
  [27, 'Co', 58.93],
  [28, 'Ni', 58.69],
  [29, 'Cu', 63.55],
  [30, 'Zn', 65.38],
  [31, 'Ga', 69.72],
  [32, 'Ge', 72.63],
  [33, 'As', 74.92],
  [34, 'Se', 78.97],
  [35, 'Br', 79.9],
  [36, 'Kr', 83.8],
  [37, 'Rb', 85.47],
  [38, 'Sr', 87.62],
  [39, 'Y', 88.91],
  [40, 'Zr', 91.22],
  [41, 'Nb', 92.91],
  [42, 'Mo', 95.95],
  [43, 'Tc', '(98)'],
  [44, 'Ru', 101.07],
  [45, 'Rh', 102.91],
  [46, 'Pd', 106.42],
  [47, 'Ag', 107.87],
  [48, 'Cd', 112.41],
  [49, 'In', 114.82],
  [50, 'Sn', 118.71],
  [51, 'Sb', 121.76],
  [52, 'Te', 127.6],
  [53, 'I', 126.9],
  [54, 'Xe', 131.29],
  [55, 'Cs', 132.91],
  [56, 'Ba', 137.33],
  [57, 'La', 138.91],
  [58, 'Ce', 140.12],
  [59, 'Pr', 140.91],
  [60, 'Nd', 144.24],
  [61, 'Pm', '(145)'],
  [62, 'Sm', 150.36],
  [63, 'Eu', 151.96],
  [64, 'Gd', 157.25],
  [65, 'Tb', 158.93],
  [66, 'Dy', 162.5],
  [67, 'Ho', 164.93],
  [68, 'Er', 167.26],
  [69, 'Tm', 168.93],
  [70, 'Yb', 173.05],
  [71, 'Lu', 174.97],
  [72, 'Hf', 178.49],
  [73, 'Ta', 180.95],
  [74, 'W', 183.84],
  [75, 'Re', 186.21],
  [76, 'Os', 190.23],
  [77, 'Ir', 192.22],
  [78, 'Pt', 195.08],
  [79, 'Au', 196.97],
  [80, 'Hg', 200.59],
  [81, 'Tl', 204.38],
  [82, 'Pb', 207.2],
  [83, 'Bi', 208.98],
  [84, 'Po', '(209)'],
  [85, 'At', '(210)'],
  [86, 'Rn', '(222)'],
  [87, 'Fr', '(223)'],
  [88, 'Ra', '(226)'],
  [89, 'Ac', '(227)'],
  [90, 'Th', 232.04],
  [91, 'Pa', 231.04],
  [92, 'U', 238.03],
  [93, 'Np', '(237)'],
  [94, 'Pu', '(244)'],
  [95, 'Am', '(243)'],
  [96, 'Cm', '(247)'],
  [97, 'Bk', '(247)'],
  [98, 'Cf', '(251)'],
  [99, 'Es', '(252)'],
  [100, 'Fm', '(257)'],
  [101, 'Md', '(258)'],
  [102, 'No', '(259)'],
  [103, 'Lr', '(262)'],
  [104, 'Rf', '(267)'],
  [105, 'Db', '(268)'],
  [106, 'Sg', '(269)'],
  [107, 'Bh', '(270)'],
  [108, 'Hs', '(269)'],
  [109, 'Mt', '(278)'],
  [110, 'Ds', '(281)'],
  [111, 'Rg', '(282)'],
  [112, 'Cn', '(285)'],
  [113, 'Nh', '(286)'],
  [114, 'Fl', '(289)'],
  [115, 'Mc', '(290)'],
  [116, 'Lv', '(293)'],
  [117, 'Ts', '(294)'],
  [118, 'Og', '(294)'],
]);

// Massa com duas casas e vírgula decimal (ex.: 1,01; 16,00).
export function formatAtomicMass(mass) {
  return typeof mass === 'number' ? mass.toFixed(2).replace('.', ',') : mass;
}

// Posição na tabela: período (1–7, lantanídios 8 e actinídios 9) e grupo (1–18;
// nas linhas dos lantanídios e actinídios, a coluna 3 a 17).
export function elementPosition(atomicNumber) {
  const z = atomicNumber;
  if (z >= 57 && z <= 71) return { row: 8, column: z - 57 + 3 };
  if (z >= 89 && z <= 103) return { row: 9, column: z - 89 + 3 };
  const starts = [1, 3, 11, 19, 37, 55, 87, 119];
  const row = starts.findIndex((start, index) => z < starts[index + 1]) + 1;
  const offset = z - starts[row - 1];
  if (row === 1) return { row, column: z === 1 ? 1 : 18 };
  if (row <= 3) return { row, column: offset < 2 ? offset + 1 : offset + 11 };
  if (row <= 5) return { row, column: offset + 1 };
  // Períodos 6 e 7: depois do grupo 2 vem o bloco f, separado embaixo.
  return { row, column: offset < 2 ? offset + 1 : offset - 13 };
}

// Disciplinas que podem trazer a tabela periódica e as constantes no anexo.
export function supportsScienceAppendix(subjects = []) {
  return subjects.some((subject) => {
    const name = String(subject || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
    return /\bquimica\b/.test(name) || /^fisica\b/.test(name);
  });
}
