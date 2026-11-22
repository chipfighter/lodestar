// The files the client shares with the plugin, in the data folder (~/.skill-loadout).

import { normalizeConfig, readLibraryFile, readNextSession } from '@shared/listing'
import type { Library, NextSession, Prefs, SkillEntry } from '../../../plugin/types'

import defaults from '../../../plugin/loadout.json'

export const FILES = {
  library: 'library.json',
  catalog: 'claude-code-skills.json',
  next: 'next-session.json',
  client: 'client.json',
} as const

export type FileName = (typeof FILES)[keyof typeof FILES]

/** library.json as read: the groups and Agents, the settings, and fields other tools keep there. */
export type LibraryValue = { library: Library; prefs: Prefs; extra: Record<string, unknown> }

/** How reading library.json went. */
export type LibraryStatus =
  | { kind: 'ok' }
  | { kind: 'missing' }
  | { kind: 'invalid'; error: string }
  | { kind: 'unreadable'; error: string }

/** claude-code-skills.json, which the plugin writes as each session starts: the skills Claude Code has. */
export type Catalog = {
  exists: boolean
  /** When a session last wrote it (milliseconds since the epoch). */
  updatedAt: number | null
  /** The patterns of the skills every set keeps; the plugin's defaults when the file does not say. */
  alwaysOn: string[]
  skills: SkillEntry[]
}

/** next-session.json as the client shows it: ready to be taken, taken by a session, or past its time. */
export type NextState =
  | { kind: 'ready'; next: NextSession; raw: Record<string, unknown> }
  | { kind: 'used'; raw: Record<string, unknown> }
  | { kind: 'expired'; raw: Record<string, unknown> }

/** The plugin's own defaults (plugin/loadout.json), as "Restore defaults" puts them back. */
export const DEFAULTS = normalizeConfig(defaults)

export function defaultLibrary(): LibraryValue {
  return {
    library: { groups: DEFAULTS.groups, presets: DEFAULTS.presets },
    prefs: { askOnNewSession: true, subagentPicker: 'agent', language: 'auto' },
    extra: {},
  }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 160)
}

/** Reads library.json's text; null means the file is not there yet. */
export function parseLibrary(text: string | null): { value: LibraryValue | null; status: LibraryStatus } {
  if (text === null) return { value: null, status: { kind: 'missing' } }
  try {
    const value = readLibraryFile(JSON.parse(text))
    return value === undefined
      ? { value: null, status: { kind: 'invalid', error: 'not a JSON object' } }
      : { value, status: { kind: 'ok' } }
  } catch (error) {
    return { value: null, status: { kind: 'invalid', error: errorText(error) } }
  }
}

function strings(list: unknown): string[] {
  return Array.isArray(list) ? list.filter((one): one is string => typeof one === 'string') : []
}

/** Reads claude-code-skills.json's text; a missing or broken file lists no skills. */
export function parseCatalog(text: string | null): Catalog {
  const empty: Catalog = { exists: text !== null, updatedAt: null, alwaysOn: DEFAULTS.alwaysOn, skills: [] }
  if (text === null) return empty
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return empty
  }
  if (typeof raw !== 'object' || raw === null) return empty
  const file = raw as Record<string, unknown>
  const skills: SkillEntry[] = []
  for (const one of Array.isArray(file.skills) ? (file.skills as unknown[]) : []) {
    if (typeof one !== 'object' || one === null) continue
    const entry = one as Record<string, unknown>
    if (typeof entry.name !== 'string' || entry.name === '') continue
    skills.push({
      name: entry.name,
      ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
      ...(typeof entry.plugin === 'string' ? { plugin: entry.plugin } : {}),
      ...(typeof entry.tokens === 'number' ? { tokens: entry.tokens } : {}),
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
    })
  }
  const updatedAt = typeof file.updatedAt === 'string' ? Date.parse(file.updatedAt) : Number.NaN

  return {
    exists: true,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : null,
    alwaysOn: Array.isArray(file.alwaysOn) ? strings(file.alwaysOn) : DEFAULTS.alwaysOn,
    skills,
  }
}

/** Reads next-session.json's text: null when there is no file, or nothing a person would want to see. */
export function parseNext(text: string | null, now: number): NextState | null {
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const file = raw as Record<string, unknown>
  if (typeof file.usedBy === 'string' && file.usedBy !== '') return { kind: 'used', raw: file }
  const next = readNextSession(file, now)

  return next === undefined ? { kind: 'expired', raw: file } : { kind: 'ready', next, raw: file }
}

/** next-session.json's text for a set prepared now. */
export function nextFileText(basedOn: string | null, groups: readonly string[], skills: readonly string[], now: number): string {
  const file = { version: 1, basedOn, groups, skills, createdAt: new Date(now).toISOString(), usedBy: null }

  return `${JSON.stringify(file, null, 2)}\n`
}
