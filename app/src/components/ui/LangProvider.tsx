'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { t as translate, type Lang, type StringKey } from '@/lib/lang'

// The resolved language, handed down from the server layout so client
// components read the same answer the server rendered with. Asking
// navigator.language here instead would let the shell and the rows disagree
// for one paint, and disagree permanently for anyone with an override.
const LangContext = createContext<Lang>('es')

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  return useContext(LangContext)
}

// Copy computed at render, never at module load. A label in a module-level
// const freezes whichever language rendered first on that server and then
// never follows the toggle for anybody else.
export function useT(): (key: StringKey) => string {
  const lang = useContext(LangContext)
  return (key) => translate(lang, key)
}
