// The files the client shares with the plugin, in the data folder (~/.skill-loadout).

import { EMPTY_LIBRARY, copyAgents, normalizeConfig, readLibraryFile, readNextSession, readPlatform, withPlatform } from '@shared/listing'
import type { Library, NextSession, Prefs, SkillEntry } from '../../../plugin/types'

import defaults from '../../../plugin/loadout.json'

export const FILES = {
  library: 'library.json',
  catalog: 'claude-code-skills.json',
  next: 'next-session.json',
  client: 'client.json',
  /** The skills Codex has, as the client last read them from Codex. */
  codexCatalog: 'codex-skills.json',
  /** Which Agent new Codex sessions use, and the skills Lodestar switched off in Codex's config.toml for it. */
  codex: 'codex.json',
} as const

export type FileName = (typeof FILES)[keyof typeof FILES]

/** library.json as read: Claude Code's groups and Agents, the settings, and the other fields (other platforms' blocks among them). */
export type LibraryValue = { library: Library; prefs: Prefs; extra: Record<string, unknown> }

/** The agent platforms the client manages: Claude Code, and Codex where it is installed. */
export type Platform = 'claude' | 'codex'

/**
 * One platform's own categories and Agents. Claude Code's are at the top of library.json, where the
 * plugin reads them; another platform's are in its block under `platforms`, empty until there is one.
 */
export function libraryOf(value: LibraryValue, platform: Platform): Library {
  return platform === 'claude' ? value.library : (readPlatform(value.extra, platform) ?? EMPTY_LIBRARY)
}

/** library.json's value with one platform's categories and Agents replaced, the others' kept. */
export function withLibrary(value: LibraryValue, platform: Platform, library: Library): LibraryValue {
  return platform === 'claude' ? { ...value, library } : { ...value, extra: withPlatform(value.extra, platform, library) }
}

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

/** codex.json: the Agent Lodestar last set for new Codex sessions (null: every skill), and what it switched off for it. */
export type CodexRecord = { agent: string | null; names: string[]; appliedAt: number | null; config: string | null }

/** Reads codex.json's text; null when Lodestar has never changed Codex. */
export function parseCodexRecord(text: string | null): CodexRecord | null {
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const file = raw as Record<string, unknown>

  return {
    agent: typeof file.agent === 'string' && file.agent !== '' ? file.agent : null,
    names: strings(file.names),
    appliedAt: typeof file.appliedAt === 'number' ? file.appliedAt : null,
    config: typeof file.config === 'string' ? file.config : null,
  }
}

/**
 * Codex's own library made from the Agent it was using (`record`), where library.json has no Codex
 * block yet: before Codex had Agents of its own, it used Claude Code's. The Agent comes over with the categories it
 * takes whole, as much of it as Codex has (`skills`; all of it while they aren't known), so new Codex
 * sessions keep loading what they did. Null when there is nothing to move.
 */
export function movedCodexLibrary(value: LibraryValue, record: CodexRecord | null, skills: readonly SkillEntry[]): LibraryValue | null {
  const agent = record?.agent ?? null
  if (agent === null || readPlatform(value.extra, 'codex') !== undefined || !(agent in value.library.presets)) return null
  const { library } = copyAgents(value.library, EMPTY_LIBRARY, [agent], skills.length > 0 ? skills : null, name => name)

  return withLibrary(value, 'codex', library)
}

/** The skills codex-skills.json says are switched off in Codex as it was last read. */
export function parseCodexOff(text: string | null): string[] {
  if (text === null) return []
  try {
    const file = JSON.parse(text) as { skills?: unknown }
    if (!Array.isArray(file.skills)) return []
    return (file.skills as unknown[]).flatMap(one => {
      const entry = one as Record<string, unknown> | null
      return entry !== null && typeof entry === 'object' && entry.enabled === false && typeof entry.name === 'string' ? [entry.name] : []
    })
  } catch {
    return []
  }
}
