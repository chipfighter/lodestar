// What the pages show, worked out from the files with the plugin's own rules.

import { groupSkills, matchesAny, resolvePreset, toPreset, type Group } from '@shared/listing'
import type { Library, Preset, SkillEntry } from '../../../plugin/types'
import type { CodexInfo } from './codex'
import { libraryOf, type Platform } from './files'
import type { DataState } from './useData'

export type Model = {
  /** The platform's own categories and Agents, which the rest is worked out from. */
  library: Library
  skills: SkillEntry[]
  names: string[]
  byName: Map<string, SkillEntry>
  /** Every group: the person's, then the ungrouped loose skills, then one per plugin or source. */
  groups: Group[]
  /** The person's categories each loose skill is in; a skill may be in several, or none. */
  categoriesOf: Map<string, Group[]>
  /** Skills kept in every set. */
  always: Set<string>
  /** The Agents each skill is in. */
  usedBy: Map<string, string[]>
  /** Skills the person switched off in the platform itself (Codex's Skills page): no Agent loads them. */
  off: Set<string>
}

export function buildModel(
  skills: readonly SkillEntry[],
  library: Library,
  alwaysOn: readonly string[],
  off: readonly string[] = [],
): Model {
  const names = skills.map(skill => skill.name)
  const groups = groupSkills(skills, library.groups, true)
  const categoriesOf = new Map<string, Group[]>()
  for (const group of groups) {
    if (group.kind !== 'custom') continue
    for (const name of group.names) categoriesOf.set(name, [...(categoriesOf.get(name) ?? []), group])
  }
  const usedBy = new Map<string, string[]>()
  for (const [agent, preset] of Object.entries(library.presets)) {
    for (const name of resolvePreset(preset, groups, names)) usedBy.set(name, [...(usedBy.get(name) ?? []), agent])
  }

  return {
    library,
    skills: [...skills],
    names,
    byName: new Map(skills.map(skill => [skill.name, skill])),
    groups,
    categoriesOf,
    always: new Set(names.filter(name => matchesAny(alwaysOn, name))),
    usedBy,
    off: new Set(off),
  }
}

/** The platforms that can be shown: Claude Code, and Codex where it is installed. */
export function availablePlatforms(codexInfo: CodexInfo | null | undefined): Platform[] {
  return codexInfo != null ? ['claude', 'codex'] : ['claude']
}

/** What the pages show for one platform: the skills it has as last read, with its own categories and Agents. */
export function platformModel(state: DataState, platform: Platform): Model {
  const library = libraryOf(state.value, platform)
  if (platform === 'claude') return buildModel(state.catalog.skills, library, state.catalog.alwaysOn)
  // What the person switched off in Codex themselves; Lodestar's own switches come and go with the Agent.
  const ours = new Set(state.codex.record?.names ?? [])

  return buildModel(state.codex.catalog.skills, library, state.codex.catalog.alwaysOn, state.codex.off.filter(name => !ours.has(name)))
}

/** The skills an Agent picks, the always-on ones aside (they are in every set). */
export function presetSkills(model: Model, preset: Preset): Set<string> {
  return new Set(resolvePreset(preset, model.groups, model.names).filter(name => !model.always.has(name)))
}

/** A selection as an Agent stores it: whole groups by id, the rest one by one. */
export function selectionPreset(model: Model, selected: ReadonlySet<string>): Preset {
  return toPreset([...selected].filter(name => !model.always.has(name)), model.groups)
}

/** Everything a set loads: its own skills and the always-on ones. */
export function loadedOf(model: Model, selected: ReadonlySet<string>): Set<string> {
  return new Set([...selected, ...model.always])
}

/** The skill listing's size for these skills, as the plugin estimates it. */
export function tokensOf(model: Model, names: Iterable<string>): number {
  let total = 0
  for (const name of names) total += model.byName.get(name)?.tokens ?? 0

  return total
}

export function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/** How a selection differs from another: skills added and skills left out. */
export function changesFrom(selected: ReadonlySet<string>, base: ReadonlySet<string>): { added: number; removed: number } {
  return {
    added: [...selected].filter(name => !base.has(name)).length,
    removed: [...base].filter(name => !selected.has(name)).length,
  }
}

export function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(name => b.has(name))
}

/** Whether a skill matches a search: its name or its description holds the text, in any case. */
export function matchesSearch(skill: SkillEntry, query: string): boolean {
  const text = query.trim().toLowerCase()
  if (text === '') return true

  return skill.name.toLowerCase().includes(text) || (skill.description ?? '').toLowerCase().includes(text)
}

/** A name for a copy of an Agent that no Agent has yet. */
export function copyName(base: string, taken: readonly string[], suffix: (n: number) => string): string {
  for (let n = 1; n < 100; n += 1) {
    const name = `${base}${suffix(n)}`
    if (!taken.includes(name)) return name
  }

  return `${base}${suffix(Date.now())}`
}
