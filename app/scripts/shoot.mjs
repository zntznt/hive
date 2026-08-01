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
const base = flag('base', 'http://127.0.0.1:3000')

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
