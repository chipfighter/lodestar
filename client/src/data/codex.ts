// Codex: its skills as Lodestar groups them, and what an Agent switches off for new Codex sessions.
//
// Codex lists every skill it finds to the model at a session's start, and reads `[[skills.config]]`
// entries in its config.toml to switch some off. Lodestar picks the Agent here, and the client's
// shell writes the entries (src-tauri/src/codex.rs).

import { groupSkills, matchesAny, resolvePreset, signature } from '@shared/listing'
import type { Library, Preset, SkillEntry } from '../../../plugin/types'

/** A skill as Codex's app server lists it (`skills/list`), with only what the client reads. */
export type CodexListed = {
  name: string
  description?: string
  shortDescription?: string
  path?: string
  /** Where Codex found it: `user` (~/.codex/skills, ~/.agents/skills), `repo`, `system` (its own), `admin`. */
  scope?: string
  enabled?: boolean
  /** The plugin it came with, as `plugin@marketplace`. */
  pluginId?: string | null
}

/** Where Codex is and where its settings are. */
export type CodexInfo = { program: string; home: string; config: string }

/** What switching Codex's skills came to. */
export type CodexApplied = { switchedOff: number; removed: number; config: string; backup: string | null }

/**
 * Skills that Codex's own features rely on, kept in every set: the review it delegates to an
 * agent, and computer use. Neither is listed to the model unless used, so keeping them costs nothing.
 */
export const CODEX_ALWAYS_ON: readonly string[] = ['review-agent', 'computer-use:*']

/** Codex's scopes as sources: its user and project skills count as installed on their own, as Claude Code's do. */
const SOURCES: Record<string, string> = {
  user: 'userSettings',
  repo: 'projectSettings',
  system: 'codex-system',
  admin: 'codex-admin',
}

/** About how many tokens a line of Codex's skill list takes: Chinese and other wide script a token a character, the rest four characters a token. */
export function estimateTokens(text: string): number {
  const wide = text.match(/[⺀-鿿가-힯豈-﫿＀-￯]/g)?.length ?? 0

  return Math.ceil(wide + (text.length - wide) / 4)
}

/** A skill Codex lists, as the pages show it: its plugin's name (before the `@`), its scope as a source, its size. */
export function codexEntry(listed: CodexListed): SkillEntry {
  const plugin = listed.pluginId ? listed.pluginId.split('@')[0] : undefined
  const description = listed.description ?? listed.shortDescription ?? ''
  // Codex's list line: "- name: description (file: r0/name/SKILL.md)".
  const line = `- ${listed.name}: ${description} (file: r0/${listed.name}/SKILL.md)`

  return {
    name: listed.name,
    source: plugin !== undefined ? 'plugin' : (SOURCES[listed.scope ?? ''] ?? 'codex-system'),
    ...(plugin !== undefined && plugin !== '' ? { plugin } : {}),
    tokens: estimateTokens(line),
    ...(description !== '' ? { description } : {}),
  }
}

/**
 * codex-skills.json's text: Codex's skills as the plugin writes Claude Code's, with whether each is
 * switched off now. A project's own skills (scope `repo`) stay out: they belong to that project, and
 * Lodestar's switch is for the skills Codex has everywhere.
 */
export function codexCatalogText(listed: readonly CodexListed[], now: number): string {
  const seen = new Set<string>()
  const skills = listed
    .filter(one => one.scope !== 'repo')
    .filter(one => typeof one.name === 'string' && one.name !== '' && !seen.has(one.name) && seen.add(one.name))
    .map(one => ({ ...codexEntry(one), enabled: one.enabled !== false, ...(one.path ? { path: one.path } : {}) }))
  const file = { platform: 'codex', updatedAt: new Date(now).toISOString(), alwaysOn: CODEX_ALWAYS_ON, skills }

  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * The skills new Codex sessions should not see under `preset` (null: every skill, so none):
 * all the skills Codex has, but the Agent's and the always-on ones.
 */
export function codexSwitchOff(
  skills: readonly SkillEntry[],
  library: Library,
  preset: Preset | null,
  alwaysOn: readonly string[] = CODEX_ALWAYS_ON,
): string[] {
  if (preset === null) return []
  const names = skills.map(skill => skill.name)
  const groups = groupSkills(skills, library.groups, true)
  const kept = new Set([...resolvePreset(preset, groups, names), ...names.filter(name => matchesAny(alwaysOn, name))])

  return names.filter(name => !kept.has(name))
}

/** Whether two lists of switched-off skills are the same, in any order. */
export function sameSwitchOff(a: readonly string[], b: readonly string[]): boolean {
  return signature(a) === signature(b)
}
