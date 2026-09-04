import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { Languages } from 'lucide-react'
import { STRINGS, LANGS } from './strings.js'

const STORAGE_KEY = 'pdfzero-lang'

const I18nContext = createContext({
  lang: 'en',
  rtl: false,
  t: (key) => key,
  setLang: () => {},
})

function detectInitialLang() {
  try {
    const url = new URLSearchParams(window.location.search).get('lang')
    if (url && STRINGS[url]) return url
  } catch (_) { /* no window */ }
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && STRINGS[saved]) return saved
  } catch (_) { /* storage unavailable */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase()
  return STRINGS[nav] ? nav : 'en'
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang)
  const rtl = !!LANGS.find((l) => l.code === lang)?.rtl

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = rtl ? 'rtl' : 'ltr'
    try { localStorage.setItem(STORAGE_KEY, lang) } catch (_) { /* ignore */ }
  }, [lang, rtl])

  const setLang = useCallback((code) => {
    if (STRINGS[code]) setLangState(code)
  }, [])

  const t = useCallback((key, vars) => {
    let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{${k}}`).join(String(v))
      }
    }
    return s
  }, [lang])

  const value = useMemo(() => ({ lang, rtl, t, setLang }), [lang, rtl, t, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Hook: const { t, lang, rtl, setLang } = useT() */
export function useT() {
  return useContext(I18nContext)
}

/** Small language dropdown for the navbar. */
export function LangSwitcher({ className = '' }) {
  const { lang, setLang, t } = useT()
  return (
    <label className={className} title={t('language')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Languages size={14} aria-hidden="true" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t('language')}
        style={{
          background: 'transparent',
          color: 'inherit',
          border: '1px solid var(--brd-2)',
          borderRadius: 'var(--r-sm)',
          padding: '4px 6px',
          fontFamily: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} style={{ color: '#000' }}>{l.name}</option>
        ))}
      </select>
    </label>
  )
}
