const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertLocalSupabaseEnvironment(environment) {
  if (environment.SUPABASE_PROJECT_REF)
    throw new Error('SUPABASE_PROJECT_REF is set for a Local run');
  for (const name of [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_LOCAL_URL',
    'ACCOUNT_API_URL',
    ...Object.keys(environment).filter((key) => key.endsWith('_DB_URL')),
  ]) {
    const value = environment[name];
    if (!value) continue;
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} is not a Local URL`);
    }
    const protocols = name.endsWith('_DB_URL')
      ? ['postgres:', 'postgresql:']
      : ['http:', 'https:'];
    if (!protocols.includes(url.protocol) || !localHosts.has(url.hostname))
      throw new Error(`${name} is not a Local URL`);
  }
}

export function assertLocalSupabaseArguments(args) {
  for (const argument of args) {
    const option = argument.split('=')[0].toLowerCase();
    if (
      [
        '--linked',
        '--db-url',
        '--workdir',
        '--project-ref',
        '--profile',
      ].includes(option) ||
      (option === '--local' && argument !== '--local')
    )
      throw new Error(`Local Supabase does not accept ${option}`);
  }
}
