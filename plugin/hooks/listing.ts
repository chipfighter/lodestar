import type { Language, Library, LoadoutConfig, NextSession, Prefs, Preset, SkillEntry } from '../types'
import { WORDS, type Lang } from './i18n'

export const DEFAULT_CONFIG: LoadoutConfig = { alwaysOn: [], groups: {}, presets: {} }

/** The settings a library.json without them has. */
export const DEFAULT_PREFS: Prefs = { askOnNewSession: true, subagentPicker: 'agent', language: 'auto' }

const LANGUAGES: readonly Language[] = ['auto', 'zh', 'en']

/** The id of the bucket that holds the loose skills no group took. */
export const UNGROUPED_ID = 'u:'

/** Where a skill counts as installed loose: a folder of its own, not part of a plugin. */
const LOOSE_SOURCES = new Set(['userSettings', 'projectSettings', 'syncedSkills'])

/**
 * A group the panel shows. `custom`: one the person made from loose skills;
 * `ungrouped`: the loose skills no custom group took; `fixed`: skills that came
 * together (a plugin, or Claude's own), which stay as they came.
 */
export type Group = {
  id: string
  label: string
  names: string[]
  kind: 'custom' | 'ungrouped' | 'fixed'
  tag?: string
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether `name` matches `pattern`, where `*` stands for any run of characters. */
export function matches(pattern: string, name: string): boolean {
  if (!pattern.includes('*')) return pattern === name
  return new RegExp(`^${pattern.split('*').map(escapeRe).join('.*')}$`).test(name)
}

export function matchesAny(patterns: readonly string[], name: string): boolean {
  return patterns.some(pattern => matches(pattern, name))
}

/** Whether a skill was installed loose rather than as part of a plugin or with Claude. */
export function isLoose(skill: SkillEntry): boolean {
  if (skill.plugin !== undefined) return false
  if (skill.source !== undefined) return LOOSE_SOURCES.has(skill.source)

  return !skill.name.includes(':')
}

/** A preset's group entry as an id; a bare name is a group of loose skills. */
function groupRef(entry: string): string {
  return /^[gpsu]:/.test(entry) ? entry : `g:${entry}`
}

/** Reads loadout.json's parsed value, keeping only the parts that have the right shape. */
export function normalizeConfig(raw: unknown): LoadoutConfig {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG
  const value = raw as Record<string, unknown>
  const strings = (list: unknown): string[] =>
    Array.isArray(list) ? list.filter((one): one is string => typeof one === 'string') : []
  const groups: Record<string, string[]> = {}
  if (typeof value.groups === 'object' && value.groups !== null) {
    for (const [name, patterns] of Object.entries(value.groups)) groups[name] = strings(patterns)
  }
  const presets: Record<string, Preset> = {}
  if (typeof value.presets === 'object' && value.presets !== null) {
    for (const [name, preset] of Object.entries(value.presets)) {
      const one = (preset ?? {}) as Record<string, unknown>
      presets[name] = { groups: strings(one.groups).map(groupRef), skills: strings(one.skills) }
    }
  }

  return { alwaysOn: strings(value.alwaysOn), groups, presets }
}

/** Whether `name` belongs to a group: some pattern matches it and no `!pattern` does. */
export function inGroup(patterns: readonly string[], name: string): boolean {
  let isIn = false
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (matches(pattern.slice(1), name)) return false
    } else if (matches(pattern, name)) {
      isIn = true
    }
  }

  return isIn
}

/** A group's patterns with `name` in it. */
export function withSkill(patterns: readonly string[], name: string): string[] {
  const kept = patterns.filter(pattern => pattern !== `!${name}`)

  return inGroup(kept, name) ? kept : [...kept, name]
}

/** A group's patterns with `name` out of it; a wildcard that still matches it gets a `!name`. */
export function withoutSkill(patterns: readonly string[], name: string): string[] {
  const kept = patterns.filter(pattern => pattern !== name)

  return inGroup(kept, name) ? [...kept, `!${name}`] : kept
}

/** Puts `names` into `target` and out of every other group; a null target only takes them out. */
export function moveSkills(
  groups: Record<string, string[]>,
  names: readonly string[],
  target: string | null,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [label, patterns] of Object.entries(groups)) {
    out[label] = names.reduce(
      (list, name) => (label === target ? withSkill(list, name) : withoutSkill(list, name)),
      patterns,
    )
  }
  if (target !== null && !(target in out)) out[target] = names.reduce(withSkill, [] as string[])

  return out
}

/** Renames a group, in the Agents that use it too; the group keeps its place. */
export function renameGroup(library: Library, from: string, to: string): Library {
  return {
    groups: Object.fromEntries(
      Object.entries(library.groups).map(([label, patterns]) => [label === from ? to : label, patterns]),
    ),
    presets: Object.fromEntries(
      Object.entries(library.presets).map(([name, preset]) => [
        name,
        { ...preset, groups: preset.groups.map(id => (id === `g:${from}` ? `g:${to}` : id)) },
      ]),
    ),
  }
}

/** Deletes a group; an Agent that used it keeps its skills, listed one by one. */
export function deleteGroup(library: Library, label: string, members: readonly string[]): Library {
  const id = `g:${label}`

  return {
    groups: Object.fromEntries(Object.entries(library.groups).filter(([one]) => one !== label)),
    presets: Object.fromEntries(
      Object.entries(library.presets).map(([name, preset]) => [
        name,
        preset.groups.includes(id)
          ? {
              groups: preset.groups.filter(group => group !== id),
              skills: [...new Set([...preset.skills, ...members])],
            }
          : preset,
      ]),
    ),
  }
}

/**
 * The groups the panel shows: the person's groups of loose skills first (a
 * skill in the first that takes it), then the loose skills left over, then the
 * skills that came together, one group per plugin or source. Only loose skills
 * go in the person's groups. An empty group of theirs shows with `isEmptyShown`.
 */
export function groupSkills(
  catalog: readonly SkillEntry[],
  library: Record<string, string[]>,
  isEmptyShown = false,
  lang: Lang = 'zh',
): Group[] {
  const words = WORDS[lang]
  const loose = catalog.filter(isLoose).map(skill => skill.name)
  const assigned = new Set<string>()
  const custom: Group[] = []
  for (const [label, patterns] of Object.entries(library)) {
    const members = loose.filter(name => !assigned.has(name) && inGroup(patterns, name))
    members.forEach(name => assigned.add(name))
    if (members.length > 0 || isEmptyShown) custom.push({ id: `g:${label}`, label, names: members, kind: 'custom' })
  }
  const rest = loose.filter(name => !assigned.has(name))
  const ungrouped: Group[] =
    rest.length > 0 ? [{ id: UNGROUPED_ID, label: words.ungrouped, names: rest, kind: 'ungrouped' }] : []
  const fixed = new Map<string, Group>()
  for (const skill of catalog) {
    if (isLoose(skill)) continue
    // The prefix a skill's name shows is the plugin's id, as the person reads it and an Agent names it.
    const prefix = skill.name.includes(':') ? skill.name.split(':')[0] : undefined
    const plugin = prefix ?? skill.plugin
    const id = plugin ? `p:${plugin}` : `s:${skill.source ?? 'other'}`
    const group: Group = fixed.get(id) ?? {
      id,
      label: plugin ?? words.sources[skill.source ?? ''] ?? words.otherSource,
      names: [],
      kind: 'fixed',
      ...(plugin ? { tag: words.pluginTag } : {}),
    }
    group.names.push(skill.name)
    fixed.set(id, group)
  }

  return [...custom, ...ungrouped, ...fixed.values()]
}

/** A group's label from its id, as an Agent names it. */
export function groupLabel(id: string, groups: readonly Group[]): string {
  return groups.find(group => group.id === id)?.label ?? id.replace(/^[gpsu]:/, '')
}

/** The skills an Agent turns on, among the names the session has. */
export function resolvePreset(preset: Preset, groups: readonly Group[], names: readonly string[]): string[] {
  const inGroups = new Set(groups.filter(group => preset.groups.includes(group.id)).flatMap(group => group.names))

  return names.filter(name => inGroups.has(name) || matchesAny(preset.skills, name))
}

/** Splits a selection back into whole groups and single skills, to save it as an Agent. */
export function toPreset(selected: readonly string[], groups: readonly Group[]): Preset {
  const chosen = new Set(selected)
  const whole = groups.filter(
    group => group.kind !== 'ungrouped' && group.names.length > 0 && group.names.every(name => chosen.has(name)),
  )
  const covered = new Set(whole.flatMap(group => group.names))

  return { groups: whole.map(group => group.id), skills: selected.filter(name => !covered.has(name)) }
}

/** A stable signature of a selection, to compare two of them. */
export function signature(allow: readonly string[] | null): string {
  return allow === null ? '*' : [...new Set(allow)].sort().join('\n')
}

// The card's own options, in Chinese (the names below) and in English. Either language's
// words are understood whichever the card shows, as a person may type either under "Other".

const both = (pick: (words: (typeof WORDS)['zh']) => string): string[] => [pick(WORDS.zh), pick(WORDS.en)]

/** The name of the loadout that holds every skill. */
export const UNLIMITED = WORDS.zh.unlimited

/** Words that name 不限制 when typed. */
export const ALL_WORDS: readonly string[] = [...both(words => words.unlimited), '全部', 'all', 'unlimited', 'every skill']

/** The card's option for the next Agents, when there are more than it holds. */
export const MORE = WORDS.zh.more
export const MORE_LABELS: readonly string[] = both(words => words.more)

/** What the card asks when a conversation's first message is sent. */
export const ASK_QUESTION = WORDS.zh.ask
export const ASK_QUESTIONS: readonly string[] = both(words => words.ask)

/** The subagent card's option for keeping the skills it would get anyway: its parent's. */
export const SAME_AS_MAIN = WORDS.zh.sameAsMain
export const SAME_AS_PARENT = WORDS.zh.sameAsParent
export const SAME_LABELS: readonly string[] = [...both(words => words.sameAsMain), ...both(words => words.sameAsParent)]

/** The card's option for the set the tray client prepared for the next session. */
export const CLIENT_PICK = WORDS.zh.clientPick
export const CLIENT_LABELS: readonly string[] = both(words => words.clientPick)

/** Words that name the client's prepared set when typed under "Other". */
export const CLIENT_WORDS: readonly string[] = ['客户端', 'client', ...CLIENT_LABELS]

/** Names an Agent may not take: they mean something else on the card. */
export const RESERVED_NAMES: readonly string[] = [...ALL_WORDS, ...MORE_LABELS, ...SAME_LABELS, ...CLIENT_LABELS]

/** The longest name an Agent or a group takes. */
export const MAX_NAME = 40

/** Whether an answer typed under "Other" asks for the client's prepared set. */
export function isClientWord(answer: string): boolean {
  const typed = answer.trim().toLowerCase()

  return CLIENT_WORDS.some(word => word.toLowerCase() === typed)
}

/** The Agents in the order the card offers them: the one this folder used last comes first. */
export function agentOrder(names: readonly string[], last: string | null): string[] {
  return last !== null && names.includes(last) ? [last, ...names.filter(name => name !== last)] : [...names]
}

/**
 * One card's options. The card holds four: the pool and the fixed options when
 * they fit, else a page of the pool beside 「更多 Agent…」, the fixed ones last.
 */
export function askPage(
  pool: readonly string[],
  start: number,
  fixed: readonly string[] = [UNLIMITED],
  more: string = MORE,
): { options: string[]; next: number } {
  if (pool.length + fixed.length <= 4) return { options: [...pool, ...fixed], next: 0 }
  const size = Math.max(1, 3 - fixed.length)
  const from = start >= 0 && start < pool.length ? start : 0
  const next = from + size >= pool.length ? 0 : from + size

  return { options: [...pool.slice(from, from + size), more, ...fixed], next }
}

/**
 * The option an answer names. A host may hand back the label itself, the label
 * with its description ("label - …"), or the tool's own sentence
 * (`"question"="label"`); text typed under "Other" may name an Agent in any case.
 */
export function pickOption(answer: string, offered: readonly string[], agents: readonly string[]): string | null {
  const typed = answer.trim()
  if (typed === '') return null
  if (offered.includes(typed)) return typed
  const quoted = [...typed.matchAll(/["“「『]([^"”」』]+)["”」』]/g)].map(match => (match[1] ?? '').trim())
  for (const one of quoted.reverse()) if (offered.includes(one)) return one
  const named = answerAgent(typed, agents, offered.includes(WORDS.en.unlimited) ? 'en' : 'zh')
  if (named !== null) return named
  const client = offered.find(label => CLIENT_LABELS.includes(label))
  if (client !== undefined && isClientWord(typed)) return client
  const lower = typed.toLowerCase()
  const longest = (labels: readonly string[], test: (label: string) => boolean): string | undefined =>
    labels.filter(label => label !== '' && test(label.toLowerCase())).sort((a, b) => b.length - a.length)[0]

  return longest(offered, label => lower.startsWith(label)) ?? longest([...offered, ...agents], label => lower.includes(label)) ?? null
}

/** The skill set a subagent's prompt names on a line of its own: `技能装配：<name>`. */
export function markerName(prompt: string): string | null {
  const found = /^[ \t]*(?:技能装配|skill[ _-]?loadout)[ \t]*[:：][ \t]*(.+?)[ \t]*$/im.exec(prompt)
  const name = found?.[1]?.replace(/^[「"“『]|[」"”』]$/g, '').trim()

  return name === undefined || name === '' ? null : name
}

/** The note a subagent's prompt gains when it was given a skill set of its own. */
export function loadoutNote(label: string, names: readonly string[]): string {
  const listed = names.length > 0 ? names.join(', ') : 'none'
  return `\n\n(Skill loadout "${label}" for this task — skills you may use: ${listed}. Other installed skills are not available here.)`
}

/** The note on the main conversation's first listing: the user's skill sets, and how a subagent gets one. */
export function subagentBrief(
  choices: readonly { name: string; summary: string }[],
  picker: Prefs['subagentPicker'],
  lang: Lang = 'zh',
): string {
  const sets = [...choices.map(one => `${one.name} (${one.summary})`), `${WORDS[lang].unlimited} (every skill)`].join('; ')
  const example = choices[0]?.name ?? 'Coding'
  // The line in the person's language: it is theirs to read in the task too.
  const line = lang === 'zh' ? '技能装配：<set name>' : 'skill loadout: <set name>'
  const asked = lang === 'zh' ? `用 ${example} 那套技能` : `use the ${example} skills`
  const how =
    picker === 'person'
      ? `The user picks the set of each subagent you start, on a card; you may suggest one by adding a line "${line}" to the Agent tool's prompt.`
      : `To give a subagent you start with the Agent tool one of these sets, add a line "${line}" to its prompt; ` +
        `do so whenever the user names a set for the work (e.g. "${asked}"). Without the line the subagent keeps this session's set.`

  return (
    `\n\n(Skill loadout — the user's skill sets for subagents: ${sets}. These sets belong to the Skill Loadout plugin; ` +
    `they are not skills, and ListSkills or SearchSkills will not find them. ${how} A forked subagent always keeps this session's set.)`
  )
}

/**
 * A prompt's mark: its text with all spacing taken out, hashed (FNV-1a) and
 * with its length. A fork of a conversation keeps its prompts as they were, so
 * their marks lead to the session it came from, while the store keeps no text.
 */
export function promptMark(text: string): string {
  const bare = text.replace(/\s+/g, '')
  let hash = 0x811c9dc5
  for (let at = 0; at < bare.length; at += 1) {
    hash ^= bare.charCodeAt(at)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `${hash.toString(16)}:${bare.length}`
}

/** Whether `text` names `name`: as a word when the name is in letters and digits, anywhere when it is in another script. */
function isNamedIn(text: string, name: string): boolean {
  if (/^[\w .+-]+$/.test(name)) return new RegExp(`(^|[^A-Za-z0-9_])${escapeRe(name)}(?=$|[^A-Za-z0-9_])`, 'i').test(text)
  return text.toLowerCase().includes(name.toLowerCase())
}

/** The one set a message names (a name inside a longer named one is that one); null for none or several. */
export function setNamedIn(text: string, sets: readonly string[]): string | null {
  const found = sets.filter(name => name !== '' && isNamedIn(text, name))
  const kept = found.filter(name => !found.some(other => other !== name && other.toLowerCase().includes(name.toLowerCase())))

  return kept.length === 1 ? (kept[0] ?? null) : null
}

/** What the main agent reads after starting a subagent that got a set of its own (`size`: null for every skill). */
export function spawnedNote(label: string, size: number | null, isPersons: boolean): string {
  const count = size === null ? 'every skill' : `${size} skill${size === 1 ? '' : 's'}`
  const why = isPersons ? 'as the user chose' : 'as your prompt named it'

  return (
    `Skill loadout: this subagent runs with the skill set "${label}" (${count}), ${why}. ` +
    'The sets belong to the Skill Loadout plugin; ListSkills and SearchSkills do not know them.'
  )
}


/**
 * The Agent an answer names: a label as offered, or a name typed under "Other" in any case;
 * for the words of 不限制 in either language, its name in `lang`. An Agent of that name wins.
 */
export function answerAgent(answer: string, agents: readonly string[], lang: Lang = 'zh'): string | null {
  const typed = answer.trim()
  if (typed === '') return null
  const lower = typed.toLowerCase()
  const named = agents.find(name => name === typed) ?? agents.find(name => name.toLowerCase() === lower)
  if (named !== undefined) return named

  return ALL_WORDS.some(word => word.toLowerCase() === lower) ? WORDS[lang].unlimited : null
}

/** An Agent in one line: its groups by label, then how many single skills it adds. */
export function agentSummary(preset: Preset, groups: readonly Group[], lang: Lang = 'zh'): string {
  const { summary } = WORDS[lang]
  const parts = preset.groups.map(id => groupLabel(id, groups)).join(summary.sep)
  const extra = preset.skills.length > 0 ? `${parts === '' ? '' : ' + '}${summary.singles(preset.skills.length)}` : ''

  return parts + extra === '' ? summary.empty : parts + extra
}

/**
 * Reads library.json's parsed value: the groups, the Agents (`agents`, or
 * `presets` as this plugin first stored them) and the settings, each kept only
 * in the right shape. Undefined for anything but an object.
 */
export function readLibraryFile(
  raw: unknown,
): { library: Library; prefs: Prefs; extra: Record<string, unknown> } | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const { groups, presets } = normalizeConfig({ groups: value.groups, presets: value.agents ?? value.presets })
  const ask = value.askOnNewSession
  const picker = value.subagentPicker
  const language = LANGUAGES.find(one => one === value.language)

  return {
    library: { groups, presets },
    prefs: {
      askOnNewSession: typeof ask === 'boolean' ? ask : DEFAULT_PREFS.askOnNewSession,
      subagentPicker: picker === 'agent' || picker === 'person' ? picker : DEFAULT_PREFS.subagentPicker,
      language: language ?? DEFAULT_PREFS.language,
    },
    extra: Object.fromEntries(Object.entries(value).filter(([key]) => !LIBRARY_KEYS.has(key))),
  }
}

/** The fields of library.json this plugin reads; another tool's own fields are kept as they are. */
const LIBRARY_KEYS = new Set(['version', 'askOnNewSession', 'subagentPicker', 'language', 'groups', 'agents', 'presets'])

/** library.json's text, in the format other tools read and write, with their own fields (`extra`) kept. */
export function libraryFileText(library: Library, prefs: Prefs, extra: Readonly<Record<string, unknown>> = {}): string {
  const file = {
    version: 1,
    askOnNewSession: prefs.askOnNewSession,
    subagentPicker: prefs.subagentPicker,
    language: prefs.language,
    groups: library.groups,
    agents: library.presets,
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => !LIBRARY_KEYS.has(key))),
  }

  return `${JSON.stringify(file, null, 2)}\n`
}

/** How long a set the client prepared for the next session stays on offer. */
export const NEXT_SESSION_TTL_MS = 2 * 60 * 60 * 1000

/** How far ahead of this machine's clock a preparation's time may be (another clock's skew). */
const SKEW_MS = 5 * 60 * 1000

/**
 * The set next-session.json offers, while a card may still offer it: well
 * formed, no session used it yet, and prepared at most two hours ago.
 */
export function readNextSession(raw: unknown, now: number): NextSession | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  if (value.version !== 1 || !Array.isArray(value.groups) || !Array.isArray(value.skills)) return undefined
  if (value.usedBy !== undefined && value.usedBy !== null) return undefined
  const createdAt = typeof value.createdAt === 'string' ? Date.parse(value.createdAt) : Number.NaN
  if (!Number.isFinite(createdAt) || now - createdAt > NEXT_SESSION_TTL_MS || createdAt - now > SKEW_MS) return undefined
  const preset = normalizeConfig({ presets: { next: { groups: value.groups, skills: value.skills } } }).presets.next
  if (preset === undefined || (preset.groups.length === 0 && preset.skills.length === 0)) return undefined
  const basedOn = typeof value.basedOn === 'string' && value.basedOn.trim() !== '' ? value.basedOn : null

  return { basedOn, preset, createdAt }
}

/** next-session.json once a session took its set: marked, so that no other session is offered it. */
export function usedNextSession(raw: Readonly<Record<string, unknown>>, sessionId: string, at: number): string {
  return `${JSON.stringify({ ...raw, usedBy: sessionId, usedAt: new Date(at).toISOString() }, null, 2)}\n`
}

/** How a set differs from the one it started from: how many skills it adds and leaves out. */
export function setChanges(set: readonly string[], base: readonly string[]): { added: number; removed: number } {
  const from = new Set(base)
  const to = new Set(set)

  return { added: [...to].filter(name => !from.has(name)).length, removed: [...from].filter(name => !to.has(name)).length }
}

/** A skill in claude-code-skills.json: as a session listed it, and when one last did. */
export type SeenSkill = SkillEntry & { lastSeen: number }

/** How long a skill no session lists any more stays in claude-code-skills.json. */
const SEEN_DAYS = 14

/**
 * The skills for claude-code-skills.json: those this session has, and those
 * earlier sessions had in the last two weeks (another folder's project skills).
 */
export function mergeSeen(old: unknown, now: readonly SkillEntry[], at: number): SeenSkill[] {
  const byName = new Map<string, SeenSkill>()
  for (const one of Array.isArray(old) ? (old as unknown[]) : []) {
    if (typeof one !== 'object' || one === null) continue
    const entry = one as Record<string, unknown>
    if (typeof entry.name !== 'string' || typeof entry.lastSeen !== 'number') continue
    if (at - entry.lastSeen > SEEN_DAYS * 86_400_000) continue
    byName.set(entry.name, {
      name: entry.name,
      ...(typeof entry.source === 'string' ? { source: entry.source } : {}),
      ...(typeof entry.plugin === 'string' ? { plugin: entry.plugin } : {}),
      ...(typeof entry.tokens === 'number' ? { tokens: entry.tokens } : {}),
      ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      lastSeen: entry.lastSeen,
    })
  }
  // A skill this session has keeps the description an earlier one read, until a listing gives it one.
  for (const skill of now) byName.set(skill.name, { ...byName.get(skill.name), ...skill, lastSeen: at })

  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * What the session has on, put in the person's words: every skill, the Agent
 * it matches, or the Agent it was based on before hand changes.
 */
export type Selection = {
  loaded: Set<string>
  matched: string | null
  basedOn: string | null
  label: string
  isAll: boolean
}

export function describeSelection(
  names: readonly string[],
  groups: readonly Group[],
  lib: Library,
  list: readonly string[] | null,
  activeName: string | null,
  always: readonly string[],
  lang: Lang = 'zh',
): Selection {
  const words = WORDS[lang]
  const unlimited = (loaded: Set<string>): Selection => ({
    loaded,
    matched: null,
    basedOn: null,
    label: words.unlimited,
    isAll: true,
  })
  if (list === null) return unlimited(new Set(names))
  const known = new Set(names)
  const loaded = new Set([...list.filter(name => known.has(name)), ...always])
  // Every skill ticked one by one is still every skill.
  if (names.length > 0 && names.every(name => loaded.has(name))) return unlimited(loaded)
  const target = signature([...loaded])
  const isMatch = (name: string): boolean => {
    const preset = lib.presets[name]
    return preset !== undefined && signature([...resolvePreset(preset, groups, names), ...always]) === target
  }
  const basedOn = activeName !== null && activeName in lib.presets ? activeName : null
  const matched = basedOn !== null && isMatch(basedOn) ? basedOn : (Object.keys(lib.presets).find(isMatch) ?? null)
  const label = matched ?? (basedOn !== null ? words.modified(basedOn) : words.custom)

  return { loaded, matched, basedOn, label, isAll: false }
}

/** The skill named by one line of a listing, or undefined when the line names none. */
export function entryName(line: string, known: readonly string[]): string | undefined {
  if (!line.startsWith('- ')) return undefined
  const rest = line.slice(2)
  let best: string | undefined
  for (const name of known) {
    const isEntry = rest === name || rest.startsWith(`${name}:`)
    if (isEntry && (best === undefined || name.length > best.length)) best = name
  }
  if (best !== undefined) return best
  // A name may hold colons itself (`plugin:skill`): the one ending the name has a space or the end after it.
  const named = /^(\S+?):(?:\s|$)/.exec(rest) ?? /^(\S+)$/.exec(rest)

  return named?.[1]
}

/** Every skill name a listing's text carries. */
export function listingNames(text: string, known: readonly string[]): string[] {
  return text
    .split('\n')
    .map(line => entryName(line, known))
    .filter((name): name is string => name !== undefined)
}

/** How long a skill's description in claude-code-skills.json may run. */
const MAX_DESCRIPTION = 300

/** What each skill of a listing is for: the text after its name, with the lines that continue it, on one line. */
export function listingDescriptions(text: string, known: readonly string[]): Record<string, string> {
  const found: Record<string, string> = {}
  let current: string | undefined
  let parts: string[] = []
  const settle = (): void => {
    if (current === undefined) return
    const description = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (description !== '') {
      found[current] = description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION - 1)}…` : description
    }
  }
  for (const line of text.split('\n')) {
    const name = entryName(line, known)
    if (name !== undefined) {
      settle()
      current = name
      const rest = line.slice(2 + name.length)
      parts = [rest.startsWith(':') ? rest.slice(1) : rest]
    } else if (line.trim() === '') {
      settle()
      current = undefined
      parts = []
    } else if (current !== undefined) {
      parts.push(line)
    }
  }
  settle()

  return found
}

/**
 * The listing with only the allowed skills left in it. A line that starts no
 * entry and is not blank continues the entry above it, and goes or stays with it.
 */
export function filterListing(
  text: string,
  allowed: ReadonlySet<string>,
  known: readonly string[],
): { text: string; hidden: number } {
  const kept: string[] = []
  let isKeeping = true
  let isInEntry = false
  let hidden = 0
  for (const line of text.split('\n')) {
    const name = entryName(line, known)
    if (name !== undefined) {
      isInEntry = true
      isKeeping = allowed.has(name)
      if (!isKeeping) hidden += 1
    } else if (line.trim() === '') {
      isInEntry = false
      isKeeping = true
    }
    if (!isInEntry || isKeeping) kept.push(line)
  }

  return { text: kept.join('\n'), hidden }
}

/**
 * The line a filtered listing ends with. Its label is how a fork of the
 * conversation, which copies the listing, takes over the same loadout.
 */
export function hiddenNote(hidden: number, label: string, isSubagent = false): string {
  const count = `${hidden} more installed skill${hidden === 1 ? ' is' : 's are'} not loaded`
  const advice = isSubagent
    ? 'for this subagent. Use only the skills listed.'
    : 'in this session. If a task clearly needs one, tell the user they can name it in a message to use it, instead of guessing its name.'

  return `\n\n(Skill loadout "${label}": ${count} ${advice})`
}
