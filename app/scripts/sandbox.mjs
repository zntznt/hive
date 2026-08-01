#!/usr/bin/env node
// The sandbox: a whole Hive on this machine, with a database you can break.
//
// It exists because the only way anybody could see a signed-in screen was to
// deploy it and open it on a phone. That makes the founder the test harness,
// which is slow, and it means every look costs a production deploy. The
// screens that were wrong for weeks were wrong in ways only a rendered page
// shows, so not being able to render one was the actual bug behind the rest.
//
//   node scripts/sandbox.mjs up      start postgres, auth, rest and storage
//   node scripts/sandbox.mjs seed    demo club and passwords for the accounts
//   node scripts/sandbox.mjs status  where everything is listening
//   node scripts/sandbox.mjs down    stop it, keep the data
//   node scripts/sandbox.mjs reset   rebuild the database from migrations
//
// Nothing here touches a deployed project. It reads .env.sandbox, which holds
// the fixed local demo keys and no real credentials.

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APP = dirname(dirname(fileURLToPath(import.meta.url)))
const EXCLUDE = 'vector,edge-runtime,supavisor,imgproxy,postgres-meta'

function env() {
  const file = join(APP, '.env.sandbox')
  if (!existsSync(file)) throw new Error('.env.sandbox is missing')
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

function supabase(args, opts = {}) {
  // The CLI is not a dependency of the app: it is a developer tool, and
  // pinning it in package.json would make every install pull a 40MB binary
  // that CI never runs.
  const bin = process.env.SUPABASE_BIN ?? 'supabase'
  return execFileSync(bin, args, { cwd: APP, stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' })
}

// Straight to postgres, for the two things that have to bypass the API: the
// passwords, and counting rows to prove the seed landed.
function sql(query) {
  return execSync(`docker exec supabase_db_app psql -U postgres -tAc ${JSON.stringify(query)}`, {
    encoding: 'utf8',
  }).trim()
}

const cmd = process.argv[2] ?? 'status'

if (cmd === 'up') {
  // Realtime, Studio and analytics are off in config.toml: realtime cannot
  // bind IPv6 in a container without it and takes the whole stack down with
  // it, and the other two are windows onto a database this script can query
  // directly.
  supabase(['start', '-x', EXCLUDE])
  console.log('\nNow: node scripts/sandbox.mjs seed')
} else if (cmd === 'down') {
  supabase(['stop'])
} else if (cmd === 'reset') {
  // Replays every migration into an empty database, which is also the check
  // that they can still build one. Two of them could not, once.
  supabase(['db', 'reset'])
  seed()
} else if (cmd === 'seed') {
  seed()
} else if (cmd === 'status') {
  supabase(['status'])
} else {
  console.error(`unknown command: ${cmd}`)
  process.exit(1)
}

function seed() {
  const e = env()
  // seed.sql writes the demo people with an empty password, because on a
  // hosted project nobody signs in with one. A browser here has no mailbox to
  // collect a code from, so the sandbox gives every demo account the same
  // password and the harness signs in with it.
  sql(
    `update auth.users set encrypted_password = crypt('${e.SANDBOX_PASSWORD}', gen_salt('bf')), ` +
      `email_confirmed_at = coalesce(email_confirmed_at, now()) where email like '%@demo.hive'`
  )
  const people = sql(`select count(*) from public.users`)
  const clubs = sql(`select count(*) from public.clubs`)
  const events = sql(`select count(*) from public.events`)
  console.log(`seeded: ${people} people, ${clubs} club(s), ${events} events`)
  console.log(`sign in as any of them with the password: ${e.SANDBOX_PASSWORD}`)
  console.log(sql(`select email || '  ' || status || (case when is_app_admin then '  (admin)' else '' end) from public.users order by email`))
}
