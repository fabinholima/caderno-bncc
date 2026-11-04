// O leitor OMR devolve o stderr do Python; o professor vê só a frase final,
// traduzida para o que ele pode fazer a seguir.
const QR_NOT_FOUND =
  'Não foi possível ler o QR Code do cartão. Escolha o aluno e assinale as respostas conforme a foto, ou fotografe novamente.';

export function friendlyScanError(message) {
  if (!message) return message ?? null;
  let text = String(message).trim();
  if (text.includes('Traceback (most recent call last)')) {
    const last = text.match(/(?:^|\s)\w+(?:Error|Exception): ([\s\S]*)$/);
    text = last
      ? last[1].trim()
      : 'A leitura automática falhou. Fotografe o cartão novamente.';
  }
  if (text.startsWith('QR Code não localizado')) {
    const hint = text
      .slice('QR Code não localizado'.length)
      .replace(/^;\s*/, '')
      .trim();
    return hint
      ? `${QR_NOT_FOUND} Dica: ${hint.charAt(0).toUpperCase()}${hint.slice(1)}`
      : QR_NOT_FOUND;
  }
  if (text === 'QR desconhecido')
    return 'O QR Code deste cartão não pertence a nenhuma aplicação ativa desta escola. Confira se o cartão é desta turma ou escolha o aluno manualmente.';
  return text;
}
