import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  // getClaims() verifies the JWT locally (ES256 keys) and still triggers the
  // session refresh + cookie write through setAll above, without the per-request
  // network round trip to Auth that getUser() makes.
  //
  // It can still fail: the signing keys are fetched and cached, so a cold
  // cache or a blip reaching Auth throws here. This runs on essentially every
  // route, so an unhandled throw takes the whole site down for that request
  // rather than one page, which is a poor trade for a refresh that the next
  // request would have done anyway. Serve the page and let the page's own
  // auth check decide what the visitor may see.
  try {
    await supabase.auth.getClaims()
  } catch {
    // fall through with whatever cookies the request already carried
  }
  return response
}

export const config = {
  // Everything Next serves under /_next is skipped, not just static and image.
  //
  // The old pattern let paths like /_next/webpack-hmr through, so a Supabase
  // session refresh ran against requests that are not pages and where no
  // visitor's session decides anything. That was only ever cost.
  //
  // It is not the fix for anything: it was written while chasing a websocket
  // that fails in the sandbox, and the websocket still fails without it. Kept
  // because it is correct on its own terms, not because it repaired that.
  matcher: ['/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
