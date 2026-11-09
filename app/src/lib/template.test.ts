// npm test  - no framework, just assert
import assert from 'node:assert'
import { renderEmailHtml } from './template'

// A member's own words land in other people's mail. They have to arrive as text.
const html = renderEmailHtml('Hola {{name}},\n<b>{{event}}</b> en {{club}}', {
  name: 'Ana <script>alert(1)</script>',
  event: '<a href="https://evil.example">Reclama tu premio</a>',
  club: `Tom & Jerry's`,
})
assert.equal(
  html,
  'Hola Ana &lt;script&gt;alert(1)&lt;/script&gt;,<br>' +
    '<b>&lt;a href=&quot;https://evil.example&quot;&gt;Reclama tu premio&lt;/a&gt;</b> en Tom &amp; Jerry&#39;s'
)

// The template's own markup is left alone, and a missing variable is empty.
assert.equal(renderEmailHtml('<p>{{name}}{{nope}}</p>', { name: null }), '<p></p>')
