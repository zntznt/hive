import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errDesc = searchParams.get('error_description') ?? searchParams.get('error')

  if (code) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}/`)
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error.message)}`)
  }

  return NextResponse.redirect(
    `${origin}/?auth_error=${encodeURIComponent(errDesc ?? 'missing_code')}`
  )
}
