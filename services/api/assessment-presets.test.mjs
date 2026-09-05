import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentPresetSchema } from './assessment-presets.mjs';

test('valida uma configuração favorita de avaliação', () => {
  const preset = assessmentPresetSchema.parse({
    name: 'Cabeçalho padrão',
    configuration: {
      header: {
        institutionName: 'Colégio Horizonte',
        teacherName: 'Ana Souza',
        className: '',
        term: '',
        date: '',
        logoDataUrl: '',
      },
      paper: 'A4',
      template: 'basicexam-v1',
      font: 'plex',
      fontSize: 11,
    },
  });
  assert.equal(preset.configuration.font, 'plex');
});

test('rejeita fonte ou tamanho arbitrários no favorito', () => {
  const base = {
    name: 'Inválido',
    configuration: {
      header: { institutionName: 'Colégio Horizonte' },
      paper: 'A4',
      template: 'basicexam-v1',
      font: 'times',
      fontSize: 18,
    },
  };
  assert.throws(() => assessmentPresetSchema.parse(base));
});
