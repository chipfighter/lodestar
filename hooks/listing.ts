import type { Library, LoadoutConfig, Prefs, Preset, SkillEntry } from '../types'

export const DEFAULT_CONFIG: LoadoutConfig = { alwaysOn: [], groups: {}, presets: {} }

/** The settings a library.json without them has. */
export const DEFAULT_PREFS: Prefs = { askOnNewSession: true, subagentPicker: 'agent' }

/** The id of the bucket that holds the loose skills no group took. */
export const UNGROUPED_ID = 'u:'

/** Where a skill counts as installed loose: a folder of its own, not part of a plugin. */
const LOOSE_SOURCES = new Set(['userSettings', 'projectSettings', 'syncedSkills'])

const SOURCE_LABEL: Record<string, string> = {
  'built-in': 'Claude 自带',
  policySettings: '组织',
  mcp: 'MCP',
}

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
): Group[] {
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
    rest.length > 0 ? [{ id: UNGROUPED_ID, label: '未归组', names: rest, kind: 'ungrouped' }] : []
  const fixed = new Map<string, Group>()
  for (const skill of catalog) {
    if (isLoose(skill)) continue
    // The prefix a skill's name shows is the plugin's id, as the person reads it and an Agent names it.
    const prefix = skill.name.includes(':') ? skill.name.split(':')[0] : undefined
    const plugin = prefix ?? skill.plugin
    const id = plugin ? `p:${plugin}` : `s:${skill.source ?? 'other'}`
    const group: Group = fixed.get(id) ?? {
      id,
      label: plugin ?? SOURCE_LABEL[skill.source ?? ''] ?? '其他',
      names: [],
      kind: 'fixed',
      ...(plugin ? { tag: '插件' } : {}),
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

/** The name of the loadout that holds every skill. */
export const UNLIMITED = '不限制'

/** Words that name 不限制 when typed. */
export const ALL_WORDS: readonly string[] = [UNLIMITED, '全部', 'all']

/** The card's option for the next Agents, when there are more than it holds. */
export const MORE = '更多 Agent…'

/** What the card asks when a conversation's first message is sent. */
export const ASK_QUESTION = '这个会话用哪套技能？'

/** The subagent card's option for keeping the skills it would get anyway: its parent's. */
export const SAME_AS_MAIN = '和主会话一样'
export const SAME_AS_PARENT = '和上级代理一样'

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
): { options: string[]; next: number } {
  if (pool.length + fixed.length <= 4) return { options: [...pool, ...fixed], next: 0 }
  const size = Math.max(1, 3 - fixed.length)
  const from = start >= 0 && start < pool.length ? start : 0
  const next = from + size >= pool.length ? 0 : from + size

  return { options: [...pool.slice(from, from + size), MORE, ...fixed], next }
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
  const named = answerAgent(typed, agents)
  if (named !== null) return named
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
export function subagentBrief(choices: readonly { name: string; summary: string }[], picker: Prefs['subagentPicker']): string {
  const sets = [...choices.map(one => `${one.name} (${one.summary})`), `${UNLIMITED} (every skill)`].join('; ')
  const example = choices[0]?.name ?? 'Coding'
  const how =
    picker === 'person'
      ? 'The user picks the set of each subagent you start, on a card; you may suggest one by adding a line "技能装配：<set name>" to the Agent tool\'s prompt.'
      : 'To give a subagent you start with the Agent tool one of these sets, add a line "技能装配：<set name>" to its prompt; ' +
        `do so whenever the user names a set for the work (e.g. "用 ${example} 那套技能"). Without the line the subagent keeps this session's set.`

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


/** The Agent an answer names: a label as offered, or a name typed under "Other" in any case; 不限制 for its words. */
export function answerAgent(answer: string, agents: readonly string[]): string | null {
  const typed = answer.trim()
  if (typed === '') return null
  const lower = typed.toLowerCase()
  if (ALL_WORDS.some(word => word.toLowerCase() === lower)) return UNLIMITED

  return agents.find(name => name === typed) ?? agents.find(name => name.toLowerCase() === lower) ?? null
}

/** An Agent in one line: its groups by label, then how many single skills it adds. */
export function agentSummary(preset: Preset, groups: readonly Group[]): string {
  const parts = preset.groups.map(id => groupLabel(id, groups)).join('、')
  const extra = preset.skills.length > 0 ? `${parts === '' ? '' : ' + '}${preset.skills.length} 个单独的 skill` : ''

  return parts + extra === '' ? '空' : parts + extra
}

/**
 * Reads library.json's parsed value: the groups, the Agents (`agents`, or
 * `presets` as this plugin first stored them) and the settings, each kept only
 * in the right shape. Undefined for anything but an object.
 */
export function readLibraryFile(raw: unknown): { library: Library; prefs: Prefs } | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const { groups, presets } = normalizeConfig({ groups: value.groups, presets: value.agents ?? value.presets })
  const ask = value.askOnNewSession
  const picker = value.subagentPicker

  return {
    library: { groups, presets },
    prefs: {
      askOnNewSession: typeof ask === 'boolean' ? ask : DEFAULT_PREFS.askOnNewSession,
      subagentPicker: picker === 'agent' || picker === 'person' ? picker : DEFAULT_PREFS.subagentPicker,
    },
  }
}

/** library.json's text, in the format other tools read and write. */
export function libraryFileText(library: Library, prefs: Prefs): string {
  const file = {
    version: 1,
    askOnNewSession: prefs.askOnNewSession,
    subagentPicker: prefs.subagentPicker,
    groups: library.groups,
    agents: library.presets,
  }

  return `${JSON.stringify(file, null, 2)}\n`
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
      lastSeen: entry.lastSeen,
    })
  }
  for (const skill of now) byName.set(skill.name, { ...skill, lastSeen: at })

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
): Selection {
  const unlimited = (loaded: Set<string>): Selection => ({
    loaded,
    matched: null,
    basedOn: null,
    label: UNLIMITED,
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
  const label = matched ?? (basedOn !== null ? `${basedOn}（改过）` : '自定义')

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
