import postgres from 'npm:postgres@3.4.3';

const connectionString = Deno.env.get('SUPABASE_POOLER_URL');
if (!connectionString) {
  console.error('NOT_RUN: SUPABASE_POOLER_URL is required.');
  Deno.exit(2);
}

const sql = postgres(connectionString, { prepare: false, max: 1 });
try {
  const rows = await sql`select spike_private.read_record(1) as value`;
  if (rows[0]?.value !== 'edge-visible') {
    throw new Error(`unexpected edge result: ${JSON.stringify(rows)}`);
  }
  console.log(
    'PASS: Deno Edge adapter connected through the transaction pooler',
  );
} finally {
  await sql.end({ timeout: 2 });
}
