import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// only internal, single-slash-prefixed paths may be used as post-auth targets
function safeNext(raw: string | null) {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
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
