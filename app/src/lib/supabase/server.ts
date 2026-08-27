import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// One client for the request, not one per call.
//
// This is called 99 times across the app and built a new client every time,
// each with its own in-memory session. That is the expensive half of a problem
// the gate and the language already hit: a client whose access token has
// expired refreshes it on first use, and in a server component the rotated
// cookie cannot be written back, because the setAll below is exactly where
// that write throws. So the next client read the same stale cookie and
// refreshed again, on a token the previous one had already rotated. Outside
// Supabase's reuse interval that second refresh is rejected, and a query that
// should have worked comes back as though the reader were a stranger.
//
// cache() is per request, so the refresh happens once and every later query on
// that request uses the token it produced, out of memory, without needing the
// cookie write a server component cannot make. Next's own authentication guide
// recommends this shape for exactly this reason.
//
// A server action gets its own memo rather than sharing the render's, which is
// fine: it is one client for the action, which is the same guarantee. And an
// action CAN write cookies, so a refresh there persists.
export const supabaseServer = cache(async function supabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // called from a Server Component without a writable response -
            // safe to ignore, proxy.ts refreshes sessions
          }
        },
      },
    }
  )
})
