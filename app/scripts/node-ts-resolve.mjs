// Lets `npm test` load the app's own modules, unchanged.
//
// Node's ESM resolver wants a complete specifier (`./lang.ts`); TypeScript's
// wants a bare one (`./lang`), and so does the `@/` alias in tsconfig. The app
// is written the TypeScript way, so rather than rewriting imports across
// `src/` to suit a test runner, this teaches the runner to read them.
//
// It is a resolve hook and nothing else: no transpiler, no dependency, no
// cache. Node 22 strips the types itself.
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const SRC = pathToFileURL(resolvePath(import.meta.dirname, '..', 'src') + '/').href

registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier
    if (!spec.startsWith('.') && !spec.startsWith(SRC)) return nextResolve(spec, context)
    try {
      return nextResolve(spec, context)
    } catch (err) {
      // A directory or an extensionless file. Try the extensions the app is
      // written in, in the order TypeScript would.
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        try {
          return nextResolve(spec + ext, context)
        } catch {
          // keep trying; the original error is the one worth reporting
        }
      }
      throw err
    }
  },
})
