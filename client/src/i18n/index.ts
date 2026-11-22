import { createContext, useContext } from 'react'

import type { Language } from '../../../plugin/types'
import { en } from './en'
import { zh, type Strings } from './zh'

export type { Strings }

/** The language to show: the setting, or for `auto` the system's (Chinese when it is Chinese, else English). */
export function stringsFor(language: Language, systemLanguage: string): Strings {
  if (language === 'zh') return zh
  if (language === 'en') return en

  return systemLanguage.toLowerCase().startsWith('zh') ? zh : en
}

export const StringsContext = createContext<Strings>(zh)

export function useStrings(): Strings {
  return useContext(StringsContext)
}

/** "3 minutes ago" in the language shown. */
export function timeAgo(strings: Strings, at: number, now: number): string {
  const format = new Intl.RelativeTimeFormat(strings.locale, { numeric: 'auto' })
  const seconds = Math.round((at - now) / 1000)
  if (Math.abs(seconds) < 60) return format.format(0, 'second')
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(hours, 'hour')

  return format.format(Math.round(hours / 24), 'day')
}

/** How long is left, as "1 小时 52 分钟" or "1 h 52 min". */
export function timeLeft(strings: Strings, ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const format = (value: number, unit: 'hour' | 'minute'): string =>
    new Intl.NumberFormat(strings.locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value)

  if (hours === 0) return format(rest, 'minute')

  return rest === 0 ? format(hours, 'hour') : `${format(hours, 'hour')} ${format(rest, 'minute')}`
}
