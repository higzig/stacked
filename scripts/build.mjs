import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const url = process.env.SUPABASE_URL, publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (url || publishableKey) {
  if (!url || !publishableKey) throw new Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid Supabase URL.');
  let role;
  try { role = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role; } catch {}
  if (publishableKey.startsWith('sb_secret_') || role === 'service_role') throw new Error('Only a public publishable/anon key may be bundled.');
  await writeFile('public/supabase-config.js', `// Public Supabase configuration.\nwindow.POPBIA_SUPABASE = ${JSON.stringify({ url, publishableKey })};\n`);
}
await build({ entryPoints: ['src/supabase-client.js'], bundle: true, minify: true, outfile: 'public/vendor/supabase.js', platform: 'browser', target: 'es2020' });
