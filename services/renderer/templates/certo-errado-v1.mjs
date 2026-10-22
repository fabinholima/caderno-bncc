import { basicExamV1 } from './basicexam-v1.mjs';

export const judgmentExamV1 = Object.freeze({
  id: 'certo-errado-v1',
  render(options) {
    return basicExamV1.render({
      ...options,
      answerLabels: ['C', 'E'],
      content: options.mode === 'student'
        ? 'Julgue cada item e marque C para certo ou E para errado.\\blank[medium]\n' + options.content
        : options.content,
    })
      .replace('layout basicexam-v1', 'layout certo-errado-v1');
  },
});
