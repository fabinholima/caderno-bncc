export const basicExamV1 = Object.freeze({
  id: 'basicexam-v1',
  render({
    paper,
    institution,
    title,
    grade,
    version,
    points,
    candidate,
    content,
  }) {
    return `% Gerado automaticamente pelo layout basicexam-v1. Não editar.
\\usemodule[basicexam][mode=student]
\\setuppapersize[${paper}]
\\setupbodyfont[modern,11pt]
\\setuplayout[topspace=16mm,backspace=18mm,width=middle,height=middle]

\\starttext
\\midaligned{\\tfd\\bf ${institution}}
\\blank[small]
\\midaligned{\\tfb ${title}}
\\midaligned{${grade} \\quad Versão ${version} \\quad Valor: ${points}}
${candidate}
\\blank[big]

${content}

\\stoptext
`;
  },
});
