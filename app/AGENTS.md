<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tone and language

- This app ships in Mexico. All user-facing copy is Mexican Spanish: natural, warm, "tú". Prefer "correo" over "email", "miembros" over "socios". Money is pesos (MXN, `$`). Phone hints use `+52`.
- No em dashes (`—`). Anywhere. Not in UI copy, not in code comments, not in commit messages, not in docs. Use a period, comma, parenthesis, or `·` instead. This is a hard rule.
- Keep operational words literal (evento, gasto, encuesta, invitación). Theme/flavor only in empty states and microcopy, never in nav, buttons, money, or errors.
