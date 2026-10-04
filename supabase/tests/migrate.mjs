// ═══════════════════════════════════════════════════════════════════════════
// ArreSchool · Aplica TODAS las migraciones en un Postgres en memoria (PGlite)
// ═══════════════════════════════════════════════════════════════════════════
// Sin Docker ni proyecto de Supabase: `supabase-stub.sql` imita lo mínimo de
// Supabase (roles anon/authenticated, auth.uid() leído de una GUC, esquema
// storage). Sirve para atrapar un error de SQL antes de `supabase db push` y
// para el test de aislamiento entre colegios (isolation.test.mjs).
//
//   node supabase/tests/migrate.mjs     ← solo comprueba que todo aplica
// ═══════════════════════════════════════════════════════════════════════════
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../migrations', import.meta.url))
export async function migrate({ quiet = false } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(readFileSync(new URL('./supabase-stub.sql', import.meta.url), 'utf8'))
  const files = readdirSync(ROOT).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const sql = readFileSync(path.join(ROOT, f), 'utf8')
    try {
      await db.exec('begin;\n' + sql + '\ncommit;')
      if (!quiet) console.log('ok  ', f)
    } catch (e) {
      console.log('FAIL', f, '→', e.message, e.position ? `@${e.position}` : '', e.where ?? '')
      try { await db.exec('rollback') } catch {}
      process.exitCode = 1
      return null
    }
  }
  return db
}
if (process.argv[1] === new URL(import.meta.url).pathname) await migrate()
