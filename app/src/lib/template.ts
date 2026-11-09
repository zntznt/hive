// Template rendering for notifications. Kept apart from notify.ts, which pulls
// in next/server and the providers, so the test runner can load it.

export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}

const HTML_ESCAPE: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// An email body is HTML, and its variables are whatever a member typed: an
// event title, a club name, a display name. Rendered raw, a title like
// `<a href=...>` becomes a link in somebody else's inbox, sent from our
// address. So every variable is escaped. The template stays as written,
// because only an app admin edits it and its markup is the point.
export function renderEmailHtml(tpl: string, vars: Record<string, unknown>) {
  const safe: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) safe[k] = String(v ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPE[c])
  return renderTemplate(tpl, safe).replace(/\n/g, '<br>')
}
