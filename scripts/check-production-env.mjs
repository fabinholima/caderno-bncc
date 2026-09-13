const required = [
  'DATABASE_URL',
  'CORS_ORIGIN',
  'RENDER_OUTPUT_DIR',
  'QR_SIGNING_SECRET',
];

export function validateProductionEnvironment(environment = process.env) {
  const errors = [];

  for (const name of required) {
    if (!String(environment[name] ?? '').trim())
      errors.push(`${name} precisa estar definida.`);
  }

  if (environment.NODE_ENV !== 'production')
    errors.push('NODE_ENV precisa ser production.');

  if (String(environment.DEV_AUTH_BYPASS).toLowerCase() === 'true')
    errors.push('DEV_AUTH_BYPASS não pode estar ativo em produção.');

  const databaseUrl = String(environment.DATABASE_URL ?? '');
  if (databaseUrl && !/^postgres(?:ql)?:\/\//.test(databaseUrl))
    errors.push('DATABASE_URL precisa usar o protocolo PostgreSQL.');

  const origins = String(environment.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.some((origin) => origin === '*' || !origin.startsWith('https://'))
  )
    errors.push('CORS_ORIGIN deve conter somente origens HTTPS explícitas.');

  const signingSecret = String(environment.QR_SIGNING_SECRET ?? '');
  if (
    signingSecret &&
    (signingSecret.length < 32 ||
      signingSecret.includes('troque-por-um-segredo'))
  )
    errors.push(
      'QR_SIGNING_SECRET precisa ter pelo menos 32 caracteres aleatórios.',
    );

  for (const name of ['EXAM_STORAGE_DIR', 'RENDER_OUTPUT_DIR']) {
    const value = String(environment[name] ?? '');
    if (value && !value.startsWith('/'))
      errors.push(`${name} precisa ser um caminho absoluto em produção.`);
  }

  const storageProvider = environment.FILE_STORAGE_PROVIDER || 'filesystem';
  if (!['filesystem', 's3'].includes(storageProvider))
    errors.push('FILE_STORAGE_PROVIDER deve ser filesystem ou s3.');
  if (storageProvider === 'filesystem' && !environment.EXAM_STORAGE_DIR)
    errors.push('EXAM_STORAGE_DIR precisa estar definida para filesystem.');
  if (storageProvider === 's3' && !environment.OBJECT_STORAGE_BUCKET)
    errors.push('OBJECT_STORAGE_BUCKET precisa estar definido para s3.');

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validateProductionEnvironment();
  if (errors.length) {
    console.error('Configuração de produção inválida:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Configuração de produção validada.');
  }
}
