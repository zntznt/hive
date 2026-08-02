// Thin fetch-based Resend client. No SDK dependency: one POST, one env var.
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'Hive <hola@hive.app>'
  if (!apiKey) {
    return { ok: false as const, skipped: true as const, error: 'RESEND_API_KEY is not configured' }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false as const, skipped: false as const, error: `Resend ${res.status}: ${body.slice(0, 300)}` }
  }
  return { ok: true as const }
}
