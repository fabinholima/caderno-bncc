import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyScanError } from './scan-errors.mjs';

const traceback = `Traceback (most recent call last):
  File "/app/services/omr/read-card.py", line 295, in <module>
    print(json.dumps(read_card(sys.argv[1], profile, '--qr-only' in sys.argv[2:])))
  File "/app/services/omr/read-card.py", line 250, in read_card
    raise ValueError("QR Code não localizado" + recapture_hint(issues))
ValueError: QR Code não localizado; a foto parece desfocada. Fotografe novamente com boa luz, sem sombras e com o celular firme.`;

test('hides the Python traceback and explains a missing QR Code', () => {
  const message = friendlyScanError(traceback);
  assert.doesNotMatch(message, /Traceback|read-card\.py|ValueError/);
  assert.match(message, /^Não foi possível ler o QR Code do cartão\./);
  assert.match(message, /Dica: A foto parece desfocada\./);
});

test('keeps plain messages and empty values', () => {
  assert.equal(
    friendlyScanError('Nem todas as páginas do PDF puderam ser convertidas.'),
    'Nem todas as páginas do PDF puderam ser convertidas.',
  );
  assert.equal(friendlyScanError(null), null);
  assert.match(
    friendlyScanError('QR desconhecido'),
    /não pertence a nenhuma aplicação/,
  );
});
