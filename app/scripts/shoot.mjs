#!/usr/bin/env node
// Open any screen of the sandbox, signed in as anybody, and photograph it.
//
//   node scripts/shoot.mjs /club/los-jueves
//   node scripts/shoot.mjs /e/<slug> --as jorge --out event
//   node scripts/shoot.mjs /account --width 1024
//
// This is the loop the app did not have. Every defect that survived a source
// review this year was one a rendered page shows in a second: an input the
// same colour as its background, a banner fading into mud, a map with its
// stylesheet missing, a cover cropped to a stripe. Reading the diff cannot
// catch those, and neither can a type checker.
//
// Prints the page's visible text as well as writing the png, because half of
// what needs checking is words.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APP = dirname(dirname(fileURLToPath(import.meta.url)))
const SHOTS = join(APP, '.sandbox-shots')

function env() {
  const out = {}
  for (const line of readFileSync(join(APP, '.env.sandbox'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const path = args.find((a) => a.startsWith('/')) ?? '/'
const who = flag('as', 'marta')
const out = flag('out', path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home')
const width = Number(flag('width', 430))
// Port 3100 is `npm run sandbox:app`: a production build, served by
// `next start`. That is deliberate and not an accident of ports.
//
// `next dev` in this container renders correct HTML and then never hydrates.
// React loads, the flight runtime loads, nothing throws, and no client
// component ever mounts, so every effect is dead and every button is a
// decoration. A shot taken against it is honest about layout and copy and
// silently wrong about anything you would click, which is the worst kind of
// harness: one that looks like it is checking.
//
// A production build hydrates here, and it is also what actually ships, so
// this points at that. Pass --base http://127.0.0.1:3000 to shoot the dev
// server anyway when you are iterating on markup and know what you are
// getting.
const base = flag('base', 'http://127.0.0.1:3100')

const e = env()

// A real session, minted the same way the app's own client would hold one:
// sign in over the API, then hand the browser the tokens under the cookie
// name @supabase/ssr reads. Going through the sign-in screen instead would
// mean collecting a six digit code out of a mailbox on every single run.
const supabase = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const { data, error } = await supabase.auth.signInWithPassword({
  email: who.includes('@') ? who : `${who}@demo.hive`,
  password: e.SANDBOX_PASSWORD,
})
if (error) {
  console.error(`could not sign in as ${who}: ${error.message}`)
  console.error('is the sandbox up and seeded? node scripts/sandbox.mjs up && node scripts/sandbox.mjs seed')
  process.exit(1)
}

// Signing in proving nothing is the trap this check exists for. Both ways this
// harness fails end with a perfectly rendered sign-in screen, and a screenshot
// of the wrong page is worse than an error because it looks like an answer.
//
// One: the session works but the database will not answer. A `db reset` that
// leaves anon and authenticated without table grants gives every query
// "permission denied", the gate reads a null profile and sends you to the
// door. Ask a question only a signed-in member can answer, and say so plainly.
{
  const { error: readErr } = await supabase.from('users').select('id').eq('id', data.session.user.id).single()
  if (readErr) {
    console.error(`signed in as ${who}, but reading their own profile failed: ${readErr.message}`)
    console.error('the database cannot answer a signed-in query. rebuild it: npm run sandbox:reset')
    process.exit(1)
  }
}

// Two: the app on :3100 is talking to a different Supabase than this script.
// NEXT_PUBLIC_* is inlined at build time, so `next build` without the sandbox
// env bakes in the production URL and no amount of env at `next start` undoes
// it. The server then looks up a member who exists only here, finds nobody,
// and redirects. `npm run sandbox:app` builds and serves with the env, which
// is the whole reason it is one script.
{
  const res = await fetch(base, { redirect: 'manual' }).catch(() => null)
  if (!res) {
    console.error(`nothing is serving ${base}. start it: npm run sandbox:app`)
    process.exit(1)
  }
  const html = await res.text()
  const wantHost = new URL(e.NEXT_PUBLIC_SUPABASE_URL).host
  const foreign = [...html.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co/g)].map((m) => m[0])
  if (!html.includes(wantHost) && foreign.length) {
    console.error(`the app on ${base} is built against ${foreign[0]}, not the sandbox at ${e.NEXT_PUBLIC_SUPABASE_URL}.`)
    console.error('NEXT_PUBLIC_* is baked in at build time, so env at start cannot fix it.')
    console.error('rebuild and serve together: npm run sandbox:app')
    process.exit(1)
  }
}

const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).host.split(':')[0]
const cookieName = `sb-${ref === '127.0.0.1' || ref === 'localhost' ? '127' : ref}-auth-token`
const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString('base64')}`

if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width, height: 932 } })
// The cookie is chunked by @supabase/ssr past 3180 bytes, the same way the
// server writes it, or the server reads half a token and treats you as a
// stranger.
const chunks = []
for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180))
await ctx.addCookies(
  chunks.map((c, i) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${i}`,
    value: c,
    url: base,
    httpOnly: false,
    sameSite: 'Lax',
  }))
)

const page = await ctx.newPage()
const problems = []
page.on('pageerror', (err) => problems.push(`pageerror: ${String(err).slice(0, 200)}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 200)}`))

await page.goto(base + path, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
// Whatever the cause, a gated route that ends on the sign-in door is a
// harness fault and not a screenshot. Say which, rather than writing a png of
// the wrong page.
if (path !== '/' && new URL(page.url()).pathname === '/') {
  console.error(`asked for ${path} as ${who} and landed on the sign-in screen.`)
  console.error('the session is good and the app is on the sandbox, so this is the app logging you out.')
  console.error('check the gate in src/lib/gate.ts and the policies for whatever this route reads.')
  process.exitCode = 1
}

const file = join(SHOTS, `${out}.png`)
await page.screenshot({ path: file, fullPage: true })

console.log(`--- ${path} as ${who} (${width}px) -> ${file}`)
console.log((await page.locator('body').innerText()).replace(/\n{2,}/g, '\n'))
if (problems.length) {
  console.log('\n--- problems')
  for (const p of [...new Set(problems)]) console.log(p)
}

await browser.close()
process.exit(0)
