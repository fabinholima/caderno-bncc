// PDFs da prova adaptada e do gabarito, montados sem ConTeXt (pdf-lib, JavaScript puro).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGINA = { largura: 595.28, altura: 841.89 };
const MARGEM = 56;
const LARGURA_UTIL = PAGINA.largura - 2 * MARGEM;

function criarEscritor(pdf, fonte, negrito) {
  let pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
  let cursor = PAGINA.altura - MARGEM;
  const aceitos = new Map();

  // Helvetica (WinAnsi) não tem todos os caracteres: os demais viram "?".
  const seguro = (caractere) => {
    if (!aceitos.has(caractere)) {
      try {
        fonte.encodeText(caractere);
        aceitos.set(caractere, caractere);
      } catch {
        aceitos.set(caractere, '?');
      }
    }
    return aceitos.get(caractere);
  };
  const texto = (valor) => Array.from(String(valor ?? ''), seguro).join('');

  const novaPagina = () => {
    pagina = pdf.addPage([PAGINA.largura, PAGINA.altura]);
    cursor = PAGINA.altura - MARGEM;
  };
  const garantir = (altura) => {
    if (cursor - altura < MARGEM) novaPagina();
  };

  const linhas = (
    conteudo,
    { tamanho = 12, recuo = 0, bold = false, centralizado = false } = {},
  ) => {
    const fonteUsada = bold ? negrito : fonte;
    const limite = LARGURA_UTIL - recuo;
    const palavras = texto(conteudo).split(/\s+/).filter(Boolean);
    const quebradas = [];
    let atual = '';
    for (const palavra of palavras) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (fonteUsada.widthOfTextAtSize(teste, tamanho) <= limite) atual = teste;
      else {
        if (atual) quebradas.push(atual);
        atual = palavra;
      }
    }
    quebradas.push(atual);
    for (const linha of quebradas) {
      garantir(tamanho + 6);
      const largura = fonteUsada.widthOfTextAtSize(linha, tamanho);
      const x = centralizado ? (PAGINA.largura - largura) / 2 : MARGEM + recuo;
      pagina.drawText(linha, {
        x,
        y: cursor - tamanho,
        size: tamanho,
        font: fonteUsada,
        color: rgb(0, 0, 0),
      });
      cursor -= tamanho + 6;
    }
  };

  const espaco = (altura = 10) => {
    cursor -= altura;
  };

  const imagem = async (imagemIncorporada) => {
    const escala = Math.min(
      LARGURA_UTIL / imagemIncorporada.width,
      220 / imagemIncorporada.height,
      1,
    );
    const largura = imagemIncorporada.width * escala;
    const altura = imagemIncorporada.height * escala;
    garantir(altura + 8);
    pagina.drawImage(imagemIncorporada, {
      x: MARGEM,
      y: cursor - altura,
      width: largura,
      height: altura,
    });
    cursor -= altura + 8;
  };

  return { linhas, espaco, imagem, texto };
}

async function incorporarImagem(pdf, dataUrl) {
  const medida = String(dataUrl ?? '').match(
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!medida)
    throw new Error(
      'Imagem da questão em formato não suportado (use PNG ou JPEG).',
    );
  const bytes = Buffer.from(medida[2], 'base64');
  return medida[1] === 'image/png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/**
 * Gera a prova do aluno e o gabarito a partir do snapshot adaptado.
 * @returns {Promise<{ studentPdf: Uint8Array, answerKeyPdf: Uint8Array }>}
 */
export async function montarPdfsAdaptados(snapshot) {
  const provaPdf = await PDFDocument.create();
  const fonteProva = await provaPdf.embedFont(StandardFonts.Helvetica);
  const negritoProva = await provaPdf.embedFont(StandardFonts.HelveticaBold);
  const prova = criarEscritor(provaPdf, fonteProva, negritoProva);

  prova.linhas(snapshot.institution?.name ?? '', {
    tamanho: 13,
    bold: true,
    centralizado: true,
  });
  prova.linhas(snapshot.assessment?.title ?? '', {
    tamanho: 14,
    bold: true,
    centralizado: true,
  });
  prova.linhas(
    `${snapshot.assessment?.grade ?? ''} — Prova adaptada — ${snapshot.totals?.points ?? 0} pontos`,
    { tamanho: 11, centralizado: true },
  );
  prova.espaco(12);
  prova.linhas(
    'Nome: ____________________________________________   Data: ____/____/______',
    { tamanho: 11 },
  );
  prova.espaco(12);
  for (const instrucao of snapshot.assessment?.instructions ?? [])
    prova.linhas(instrucao, { tamanho: 12 });
  prova.espaco(14);

  for (const questao of snapshot.questions ?? []) {
    prova.linhas(`${questao.number}.`, { tamanho: 13, bold: true });
    for (const no of questao.statement ?? []) {
      if (no.type === 'paragraph') prova.linhas(no.text, { tamanho: 13 });
      if (no.type === 'image')
        await prova.imagem(await incorporarImagem(provaPdf, no.dataUrl));
    }
    for (const alternativa of questao.alternatives ?? []) {
      const texto = (alternativa.content ?? [])
        .map((no) => no.text ?? '')
        .join(' ');
      prova.linhas(`${alternativa.label}) ${texto}`, {
        tamanho: 13,
        recuo: 18,
      });
    }
    prova.espaco(14);
  }
  const studentPdf = await provaPdf.save();

  const gabaritoPdf = await PDFDocument.create();
  const fonteGabarito = await gabaritoPdf.embedFont(StandardFonts.Helvetica);
  const negritoGabarito = await gabaritoPdf.embedFont(
    StandardFonts.HelveticaBold,
  );
  const gabarito = criarEscritor(gabaritoPdf, fonteGabarito, negritoGabarito);
  gabarito.linhas('GABARITO — PROVA ADAPTADA', {
    tamanho: 14,
    bold: true,
    centralizado: true,
  });
  gabarito.linhas(snapshot.assessment?.title ?? '', {
    tamanho: 12,
    centralizado: true,
  });
  gabarito.espaco(14);
  for (const questao of snapshot.questions ?? []) {
    const correta = (questao.alternatives ?? []).find((alt) =>
      (questao.answer?.correctStableKeys ?? []).includes(alt.stableKey),
    );
    gabarito.linhas(`Questão ${questao.number}: ${correta?.label ?? '—'}`, {
      tamanho: 12,
    });
  }
  const answerKeyPdf = await gabaritoPdf.save();

  return { studentPdf, answerKeyPdf };
}
