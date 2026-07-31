import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// Only internal paths may be used as post-auth targets. The second character
// has to be checked for a backslash as well as a slash: browsers normalize
// "/\evil.com" to "//evil.com", so a startsWith('//') test alone lets an
// absolute URL through and turns sign-in into an open redirect.
function safeNext(raw: string | null) {
  return raw && /^\/[^/\\]/.test(raw) ? raw : '/'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const errDesc = searchParams.get('error_description') ?? searchParams.get('error')

  if (code) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(
    `${origin}/?auth_error=${encodeURIComponent(errDesc ?? 'missing_code')}`
  )
}
