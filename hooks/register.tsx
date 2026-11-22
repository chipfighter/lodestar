import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  AgentDraft,
  DataFile,
  Library,
  LoadoutConfig,
  PaneState,
  PendingSpawn,
  Prefs,
  SessionLock,
  SkillEntry,
  StoredLock,
  SubLoadout,
  View,
} from '../types'
import {
  ALL_WORDS,
  ASK_QUESTION,
  DEFAULT_CONFIG,
  DEFAULT_PREFS,
  MORE,
  SAME_AS_MAIN,
  SAME_AS_PARENT,
  UNLIMITED,
  agentOrder,
  agentSummary,
  answerAgent,
  askPage,
  deleteGroup,
  describeSelection,
  filterListing,
  groupLabel,
  groupSkills,
  hiddenNote,
  isLoose,
  libraryFileText,
  listingNames,
  loadoutNote,
  markerName,
  matchesAny,
  mergeSeen,
  moveSkills,
  normalizeConfig,
  pickOption,
  promptMark,
  readLibraryFile,
  renameGroup,
  resolvePreset,
  setNamedIn,
  spawnedNote,
  subagentBrief,
  toPreset,
} from './listing'
import type { Group, Selection } from './listing'

const PANE = 'skill-loadout'
const TITLE = '技能装配'
/** Names an Agent may not take: they mean something else on the card. */
const RESERVED = [...ALL_WORDS, MORE, SAME_AS_MAIN, SAME_AS_PARENT]
/** How a subagent's skills were settled, as the panel says it. */
const SETTLED_BY: Record<SubLoadout['by'], string> = {
  agent: '主代理选的',
  person: '你选的',
  inherit: '沿用上级',
  fork: 'fork，沿用上级',
}
const MAX_NAME = 40
/** The store's copy of library.json as last read or written, for when the file is missing or broken. */
const LIBRARY_KEY = 'library-v2'
const LOCKS_KEY = 'locks'
const MAX_LOCKS = 100
/** How many reply marks a lock keeps: the first ones, which a fork from any point carries, and the newest. */
const FIRST_ANCHORS = 5
const MAX_ANCHORS = 40
/** How long a reply must be, spacing aside, to tell its conversation apart. */
const MIN_MARKED = 20
/** The folder shared with other tools: `.skill-loadout` in the user's home, unless SKILL_LOADOUT_HOME names one. */
const DATA_DIR = '.skill-loadout'
const LIBRARY_FILE = 'library.json'
const CATALOG_FILE = 'claude-code-skills.json'
/** How many answers that name no Agent the card takes before the conversation starts with what it has. */
const MAX_MISSES = 3
/** How many cards one first message shows at most, paging through the Agents included. */
const MAX_ROUNDS = 40
/** Where a prompt comes from when a person sent it, so that someone is there to answer the card. */
const PERSON_ORIGINS = new Set(['composer', 'sdk', 'bridge', 'unclassified'])

// Change a tag when that value's shape changes: an earlier version's value then reads as the initial one.
const allow = atom({ plugin: 'skill-loadout', key: 'allow' } as const, null as string[] | null, { shape: 'allow-1' })
const active = atom({ plugin: 'skill-loadout', key: 'active' } as const, null as string | null, { shape: 'active-1' })
const catalog = atom({ plugin: 'skill-loadout', key: 'catalog' } as const, [] as SkillEntry[], { shape: 'catalog-1' })
const expanded = atom({ plugin: 'skill-loadout', key: 'expanded' } as const, [] as string[], { shape: 'expanded-2' })
const config = atom({ plugin: 'skill-loadout', key: 'config' } as const, DEFAULT_CONFIG, { shape: 'config-2' })
const library = atom({ plugin: 'skill-loadout', key: 'library' } as const, { groups: {}, presets: {} } as Library, { shape: 'library-2' })
const prefs = atom({ plugin: 'skill-loadout', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-1' })
const dataFile = atom({ plugin: 'skill-loadout', key: 'dataFile' } as const, { path: '', status: 'unavailable' } as DataFile, {
  shape: 'datafile-1',
})
const view = atom({ plugin: 'skill-loadout', key: 'view' } as const, 'main' as View, { shape: 'view-1' })
const draft = atom({ plugin: 'skill-loadout', key: 'draft' } as const, null as AgentDraft | null, { shape: 'draft-1' })
const editGroup = atom({ plugin: 'skill-loadout', key: 'editGroup' } as const, null as string | null, { shape: 'editgroup-1' })
const confirming = atom({ plugin: 'skill-loadout', key: 'confirming' } as const, null as string | null, { shape: 'confirming-1' })
const pane = atom({ plugin: 'skill-loadout', key: 'pane' } as const, 'never' as PaneState, { shape: 'pane-1' })
const lock = atom({ plugin: 'skill-loadout', key: 'lock' } as const, null as SessionLock | null, { shape: 'lock-1' })
const cwd = atom({ plugin: 'skill-loadout', key: 'cwd' } as const, '', { shape: 'cwd-1' })
const chosen = atom({ plugin: 'skill-loadout', key: 'chosen' } as const, false, { shape: 'chosen-1' })
const asking = atom({ plugin: 'skill-loadout', key: 'asking' } as const, false, { shape: 'asking-1' })
const lastPrompt = atom({ plugin: 'skill-loadout', key: 'lastPrompt' } as const, '', { shape: 'prompt-1' })
const subagents = atom({ plugin: 'skill-loadout', key: 'subagents' } as const, {} as Record<string, SubLoadout>, {
  shape: 'subagents-1',
})
const pending = atom({ plugin: 'skill-loadout', key: 'pending' } as const, [] as PendingSpawn[], { shape: 'pending-1' })
const briefed = atom({ plugin: 'skill-loadout', key: 'briefed' } as const, false, { shape: 'briefed-1' })
const anchors = atom({ plugin: 'skill-loadout', key: 'anchors' } as const, [] as string[], { shape: 'anchors-1' })

type Remembered = { preset: string | null; allow: string[] | null }
type LibraryValue = { library: Library; prefs: Prefs }
/** A loop's skills: every one when `allow` is null. */
type Held = { allow: string[] | null; label: string }

/**
 * Lines under the card's options beside what each Agent holds, by the card's
 * question: what 「和主会话一样」 keeps, which option the main agent suggested.
 */
const cardNotes = new Map<string, Record<string, string>>()

/** The sets spawns settled, by the Agent call that asked for each, until that call's result goes back. */
const spawnedSets = new Map<string, SubLoadout>()

const LOADOUT_TOOL = {
  name: 'loadout',
  description:
    'Skill Loadout: action "status" returns the skills this session loads (the person picks an Agent when the ' +
    "conversation's first message is sent; locked after that), the Agents, the skill groups, where they are " +
    'stored, and diagnostics; "open" opens the Skill Loadout panel.',
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['status', 'open'] } },
    required: ['action'],
  },
}

function lockedText(label: string): string {
  return (
    `这个会话的装配已经锁定（${label}），不能再换。想换一组 skill，请新开一个会话；` +
    '临时要用某个 skill，在消息里写出它的名字。'
  )
}

function shortError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

async function nowOr0($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return 0
  }
}

// Reading what is installed and what is chosen.

async function loadConfig($: EngineInterface): Promise<LoadoutConfig> {
  try {
    return normalizeConfig(JSON.parse(await $.fs.read(`${$.plugin.root}/loadout.json`)))
  } catch {
    return DEFAULT_CONFIG
  }
}

// The library lives in library.json, a plain file other tools can read and write too.

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`
}

async function envValue(get: () => Promise<string | undefined>): Promise<string | undefined> {
  try {
    const value = (await get())?.trim()
    return value === undefined || value === '' ? undefined : value
  } catch {
    return undefined
  }
}

/** The folder shared with other tools, or null where no home folder is known. */
async function dataDir($: EngineInterface): Promise<string | null> {
  const own = await envValue(() => $.env.get('SKILL_LOADOUT_HOME'))
  if (own !== undefined) return own
  const home = (await envValue(() => $.env.get('USERPROFILE'))) ?? (await envValue(() => $.env.get('HOME')))
  return home === undefined ? null : joinPath(home, DATA_DIR)
}

/** The store's copy of the library, or loadout.json's defaults when there is none. */
async function storedLibrary($: EngineInterface): Promise<LibraryValue> {
  try {
    const stored = readLibraryFile(await $.store.get(LIBRARY_KEY))
    if (stored !== undefined) return stored
  } catch {
    // No store: the defaults below.
  }
  const defaults = await read($, config)
  return { library: { groups: defaults.groups, presets: defaults.presets }, prefs: DEFAULT_PREFS }
}

async function setLibrary($: EngineInterface, value: LibraryValue, file: DataFile): Promise<void> {
  await update($, library, () => value.library)
  await update($, prefs, () => value.prefs)
  await update($, dataFile, () => file)
}

async function keepCopy($: EngineInterface, value: LibraryValue): Promise<void> {
  const copy = JSON.parse(libraryFileText(value.library, value.prefs)) as unknown
  if (JSON.stringify(await $.store.get(LIBRARY_KEY)) !== JSON.stringify(copy)) await $.store.set(LIBRARY_KEY, copy)
}

/**
 * Reads the Agents, groups and settings from library.json. A missing file is
 * made from the store's copy (or loadout.json's defaults); a broken one is left
 * as the person wrote it, and the store's copy is used until they fix it or
 * save over it from the panel.
 */
async function loadLibrary($: EngineInterface): Promise<string> {
  const fallback = await storedLibrary($)
  const dir = await dataDir($)
  if (dir === null) {
    await setLibrary($, fallback, { path: '', status: 'unavailable' })
    return 'no home folder'
  }
  const path = joinPath(dir, LIBRARY_FILE)
  let text: string | null = null
  try {
    if (await $.fs.exists(path)) text = await $.fs.read(path)
  } catch (error) {
    await setLibrary($, fallback, { path, status: 'unreadable', error: shortError(error) })
    return 'unreadable'
  }
  if (text === null) {
    await setLibrary($, fallback, { path, status: 'ok' })
    await writeLibrary($)
    return 'created'
  }
  let parsed: LibraryValue | undefined
  let problem = '不是一个 JSON 对象'
  try {
    parsed = readLibraryFile(JSON.parse(text))
  } catch (error) {
    parsed = undefined
    problem = shortError(error)
  }
  if (parsed === undefined) {
    await setLibrary($, fallback, { path, status: 'invalid', error: problem })
    return 'invalid'
  }
  await setLibrary($, parsed, { path, status: 'ok' })
  await keepCopy($, parsed)
  return 'ok'
}

/** Writes the library and settings to library.json, keeping the store's copy in step. */
async function writeLibrary($: EngineInterface): Promise<void> {
  const value = { library: await read($, library), prefs: await read($, prefs) }
  await keepCopy($, value)
  const file = await read($, dataFile)
  if (file.path === '') return
  try {
    await $.fs.write(file.path, libraryFileText(value.library, value.prefs))
    if (file.status !== 'ok') await update($, dataFile, (): DataFile => ({ path: file.path, status: 'ok' }))
  } catch (error) {
    await update($, dataFile, (): DataFile => ({ path: file.path, status: 'unwritable', error: shortError(error) }))
  }
}

/** The library as library.json holds it now: another session, or another tool, may have changed it. */
async function freshLibrary($: EngineInterface): Promise<Library> {
  await loadLibrary($)
  return read($, library)
}

async function saveLibrary($: EngineInterface, next: Library): Promise<void> {
  await update($, library, () => next)
  await writeLibrary($)
}

async function setAsk($: EngineInterface, isOn: boolean): Promise<void> {
  await freshLibrary($)
  await update($, prefs, old => ({ ...old, askOnNewSession: isOn }))
  await writeLibrary($)
  $.ui.toast(isOn ? '新会话发第一条消息时，会先问你用哪套技能' : '新会话不再先问；要选的话，发第一条消息前打开面板选')
}

async function setSubagentPicker($: EngineInterface, picker: Prefs['subagentPicker']): Promise<void> {
  await freshLibrary($)
  await update($, prefs, old => ({ ...old, subagentPicker: picker }))
  await writeLibrary($)
  $.ui.toast(picker === 'person' ? '以后每开一个子代理，都弹卡片问你用哪套技能' : '以后子代理的技能由主代理决定')
}

async function addToCatalog($: EngineInterface, found: readonly SkillEntry[]): Promise<void> {
  if (found.length === 0) return
  await update($, catalog, old => {
    const byName = new Map(old.map(skill => [skill.name, skill]))
    for (const skill of found) byName.set(skill.name, { ...byName.get(skill.name), ...skill })

    return [...byName.values()]
  })
}

/** Reads every skill the session has from the context breakdown, as /context counts it. */
async function refreshCatalog($: EngineInterface): Promise<void> {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const listed = usage.context.breakdown?.skills?.skillFrontmatter ?? []
    await addToCatalog(
      $,
      listed.map(skill => ({
        name: skill.name,
        source: skill.source,
        plugin: skill.pluginName,
        tokens: skill.tokens,
      })),
    )
  } catch {
    // The listing itself fills the catalog when it first goes out.
  }
}

/** Writes the skills Claude Code has to claude-code-skills.json, for other tools to show. */
async function writeCatalogFile($: EngineInterface): Promise<string> {
  const skills = await read($, catalog)
  if (skills.length === 0) return 'nothing known yet'
  const dir = await dataDir($)
  if (dir === null) return 'no home folder'
  const path = joinPath(dir, CATALOG_FILE)
  let old: unknown
  try {
    if (await $.fs.exists(path)) old = (JSON.parse(await $.fs.read(path)) as { skills?: unknown }).skills
  } catch {
    old = undefined
  }
  const at = await nowOr0($)
  const seen = mergeSeen(old, skills, at)
  const file = { platform: 'claude-code', updatedAt: new Date(at).toISOString(), skills: seen }
  await $.fs.write(path, `${JSON.stringify(file, null, 2)}\n`)
  return `${seen.length} skills`
}

async function allNames($: EngineInterface): Promise<string[]> {
  return (await read($, catalog)).map(skill => skill.name)
}

async function groupsNow($: EngineInterface, isEmptyShown = false): Promise<Group[]> {
  return groupSkills(await read($, catalog), (await read($, library)).groups, isEmptyShown)
}

async function alwaysNow($: EngineInterface): Promise<string[]> {
  const { alwaysOn } = await read($, config)

  return (await allNames($)).filter(name => matchesAny(alwaysOn, name))
}

async function selectionNow($: EngineInterface): Promise<Selection> {
  const skills = await read($, catalog)
  const lib = await read($, library)

  return describeSelection(
    skills.map(skill => skill.name),
    groupSkills(skills, lib.groups),
    lib,
    await read($, allow),
    await read($, active),
    await alwaysNow($),
  )
}

// The lock: a session settles its loadout before its first turn and keeps it to the end,
// because a listing that changed later would have the model read the whole conversation again.

async function sessionIdNow($: EngineInterface): Promise<string> {
  try {
    return await $.session.id()
  } catch {
    return ''
  }
}

async function readLocks($: EngineInterface): Promise<Record<string, StoredLock>> {
  const stored = await $.store.get(LOCKS_KEY)

  return typeof stored === 'object' && stored !== null ? (stored as Record<string, StoredLock>) : {}
}

/** Marks with `added` after them, none twice: the first few stay, as a fork from any point carries them, and the newest. */
function withAnchors(kept: readonly string[], added: readonly string[]): string[] {
  const all = [...kept]
  for (const mark of added) if (!all.includes(mark)) all.push(mark)

  return all.length > MAX_ANCHORS ? [...all.slice(0, FIRST_ANCHORS), ...all.slice(FIRST_ANCHORS - MAX_ANCHORS)] : all
}

/** Keeps the session's lock in the store, the newest ones only, with the marks of the replies a fork of it will carry. */
async function saveLock($: EngineInterface, held: SessionLock, inherited: readonly string[] = []): Promise<void> {
  if (held.sessionId === '') return
  const at = await nowOr0($)
  const stored = await readLocks($)
  const trimmed = withAnchors(stored[held.sessionId]?.anchors ?? [], [...inherited, ...(await read($, anchors))])
  const saved: StoredLock = {
    allow: await read($, allow),
    agent: await read($, active),
    label: held.label,
    at,
    anchors: trimmed,
  }
  const locks = { ...stored, [held.sessionId]: saved }
  const newest = Object.entries(locks)
    .sort(([, a], [, b]) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, MAX_LOCKS)
  await $.store.set(LOCKS_KEY, Object.fromEntries(newest))
}

/** Brings back the loadout a session was locked with, when it is resumed. */
async function restoreLock($: EngineInterface, sessionId: string): Promise<boolean> {
  const saved = (await readLocks($))[sessionId]
  if (saved === undefined || typeof saved.label !== 'string') return false
  const list = Array.isArray(saved.allow) ? saved.allow.filter(name => typeof name === 'string') : null
  await update($, allow, () => list)
  await update($, active, () => (typeof saved.agent === 'string' ? saved.agent : null))
  await update($, lock, () => ({ sessionId, label: saved.label }))

  return true
}

/** Freezes this session's loadout: its own from an earlier run if it has one, else what is chosen now. */
async function lockSession($: EngineInterface): Promise<void> {
  if ((await read($, lock)) !== null) return
  const sessionId = await sessionIdNow($)
  if (sessionId !== '' && (await restoreLock($, sessionId))) return
  const held: SessionLock = { sessionId, label: (await selectionNow($)).label }
  await update($, lock, () => held)
  await saveLock($, held)
}

/** Whether the conversation already has a reply in it: a resumed or forked one, not a new one. */
async function hasHistory($: EngineInterface): Promise<boolean> {
  try {
    return (await $.session.messages()).some(message => message.role === 'assistant')
  } catch {
    return false
  }
}

/**
 * The mark of a reply of the model: none for a short one, which another
 * conversation may well have word for word ("OK"); a longer one is its own.
 */
function replyMark(text: string): string | undefined {
  return text.replace(/\s+/g, '').length >= MIN_MARKED ? promptMark(text) : undefined
}

/** Keeps a reply's mark, under the lock too once there is one, for a fork of the conversation to find it by. */
async function noteReply($: EngineInterface, mark: string): Promise<void> {
  await update($, anchors, old => withAnchors(old, [mark]))
  const held = await read($, lock)
  if (held !== null) await saveLock($, held)
}

/**
 * The lock of the session this one was forked from: the one that holds the
 * most of the marks of the replies its history carries, the newest of those.
 * A fork copies the replies as they were, and no other conversation has them.
 */
async function forkedFrom($: EngineInterface): Promise<StoredLock | undefined> {
  let marks: Set<string>
  try {
    const rows = await $.session.messages()
    marks = new Set(
      rows
        .filter(row => row.role === 'assistant')
        .map(row => replyMark(row.text))
        .filter((mark): mark is string => mark !== undefined),
    )
  } catch {
    return undefined
  }
  if (marks.size === 0) return undefined
  let best: StoredLock | undefined
  let bestScore = 0
  for (const one of Object.values(await readLocks($))) {
    const score = Array.isArray(one.anchors) ? one.anchors.filter(mark => marks.has(mark)).length : 0
    const isNewer = (one.at ?? 0) > (best?.at ?? 0)
    if (score > bestScore || (score > 0 && score === bestScore && isNewer)) {
      best = one
      bestScore = score
    }
  }

  return best
}

/**
 * Settles the loadout as the session starts: a locked one keeps its lock, a
 * resumed one gets its own back, a forked one takes the lock of the session it
 * came from, one with history and none found is locked as it stands, and a new
 * one waits for its first message, when the person is asked.
 */
async function settleLoadout($: EngineInterface): Promise<string> {
  const sessionId = await sessionIdNow($)
  const held = await read($, lock)
  if (held !== null && held.sessionId === sessionId) return 'locked (kept)'
  await update($, lock, () => null)
  await update($, briefed, () => true)
  if (sessionId !== '' && (await restoreLock($, sessionId))) return 'locked (restored)'
  if (await hasHistory($)) {
    const parent = await forkedFrom($)
    if (parent !== undefined && typeof parent.label === 'string') {
      const lib = await read($, library)
      const list = Array.isArray(parent.allow) ? parent.allow.filter(name => typeof name === 'string') : null
      await update($, allow, () => list)
      await update($, active, () => (typeof parent.agent === 'string' && parent.agent in lib.presets ? parent.agent : null))
      const inherited: SessionLock = { sessionId, label: parent.label }
      await update($, lock, () => inherited)
      await saveLock($, inherited, parent.anchors ?? [])
      return `locked (forked: ${parent.label})`
    }
    // A conversation from before this plugin: it keeps what it has had.
    await lockSession($)
    return 'locked (had history)'
  }
  await update($, briefed, () => false)

  return 'open'
}

// Subagents: each settles its skills as it is spawned, and keeps them.

/** The main conversation's skills: its lock, or what is chosen so far. */
async function mainLoadout($: EngineInterface): Promise<Held> {
  const held = await read($, lock)
  return { allow: await read($, allow), label: held?.label ?? (await selectionNow($)).label }
}

function spawnKey(parentId: string | undefined, type: string, description: string): string {
  return `${parentId ?? ''}\n${type}\n${description}`
}

async function recordSubagent($: EngineInterface, agentId: string, loadout: SubLoadout): Promise<void> {
  await update($, subagents, old => ({ ...old, [agentId]: loadout }))
}

/**
 * A loop's skills: main's for the main conversation; a subagent's as its spawn
 * settled them; else its parent's (a fork's rows, or a spawn this plugin missed).
 */
async function loadoutOf($: EngineInterface, agentId: string | undefined, depth = 0): Promise<Held> {
  if (agentId === undefined || depth > 8) return mainLoadout($)
  const known = (await read($, subagents))[agentId]
  if (known !== undefined) return known
  let info: { parentId?: string; type: string; description: string } | undefined
  try {
    info = (await $.agent.list()).find(one => one.id === agentId)
  } catch {
    info = undefined
  }
  if (info === undefined) return mainLoadout($)
  // Its first request can come before its spawn's hook has its id: the spawn waits under its key.
  const key = spawnKey(info.parentId, info.type, info.description)
  const waiting = (await read($, pending)).find(one => one.key === key)
  if (waiting !== undefined) {
    await recordSubagent($, agentId, waiting.loadout)
    return waiting.loadout
  }

  return loadoutOf($, info.parentId, depth + 1)
}

/** A subagent's skills from a name: an Agent's, or every skill for 不限制; undefined for no Agent. */
async function namedLoadout($: EngineInterface, name: string, task: Pick<SubLoadout, 'description' | 'prompt' | 'by'>): Promise<SubLoadout | undefined> {
  if (ALL_WORDS.includes(name)) return { ...task, allow: null, label: UNLIMITED }
  const preset = (await read($, library)).presets[name]
  if (preset === undefined) return undefined

  return { ...task, allow: resolvePreset(preset, await groupsNow($), await allNames($)), label: name }
}

/** The note on the main conversation's first listing that tells the model how subagents get their skills. */
async function briefing($: EngineInterface): Promise<string> {
  const lib = await read($, library)
  const groups = await groupsNow($, true)
  const choices = Object.entries(lib.presets)
    .filter(([name]) => !RESERVED.includes(name))
    .map(([name, preset]) => ({ name, summary: agentSummary(preset, groups) }))

  return choices.length === 0 ? '' : subagentBrief(choices, (await read($, prefs)).subagentPicker)
}

// The session's loadout, while it can still be changed.

async function remember($: EngineInterface, value: Remembered): Promise<void> {
  const folder = await read($, cwd)
  if (folder === '') return
  const byFolder = ((await $.store.get('byFolder')) ?? {}) as Record<string, Remembered>
  await $.store.set('byFolder', { ...byFolder, [folder]: value })
}

/** The Agent this folder's conversations used last, which the card offers first. */
async function lastAgentHere($: EngineInterface): Promise<string | null> {
  const folder = await read($, cwd)
  const byFolder = ((await $.store.get('byFolder')) ?? {}) as Record<string, Remembered>

  return byFolder[folder]?.preset ?? null
}

/** Sets this session's selection, before its first turn; every skill ticked is "every skill". */
async function choose($: EngineInterface, next: string[] | null, agent: string | null): Promise<void> {
  const held = await read($, lock)
  if (held !== null) {
    $.ui.toast(lockedText(held.label))
    return
  }
  const names = await allNames($)
  const isAll = next !== null && names.length > 0 && names.every(name => next.includes(name))
  const value = isAll ? null : next
  await update($, allow, () => value)
  await update($, active, () => (isAll ? null : agent))
  await update($, chosen, () => true)
  await remember($, { preset: isAll ? null : agent, allow: value })
  $.ui.invalidate('prompt.attachment')
}

async function applyAgent($: EngineInterface, name: string): Promise<boolean> {
  if (ALL_WORDS.includes(name)) {
    await choose($, null, null)
    return true
  }
  const preset = (await read($, library)).presets[name]
  if (preset === undefined) return false
  await choose($, resolvePreset(preset, await groupsNow($), await allNames($)), name)

  return true
}

/** The selection as a list, with null ("all") spelled out. */
async function current($: EngineInterface): Promise<string[]> {
  return (await read($, allow)) ?? (await allNames($))
}

async function toggleSkill($: EngineInterface, name: string): Promise<void> {
  const list = await current($)
  const next = list.includes(name) ? list.filter(one => one !== name) : [...list, name]
  await choose($, next, await read($, active))
}

async function setGroup($: EngineInterface, group: Group, isOn: boolean): Promise<void> {
  const list = new Set(await current($))
  group.names.forEach(name => (isOn ? list.add(name) : list.delete(name)))
  await choose($, [...list], await read($, active))
}

function cleanName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME)
}

/** Why a name cannot be an Agent's, or undefined when it can. */
function nameProblem(name: string): string | undefined {
  if (name === '') return '先给 Agent 起个名字'
  return RESERVED.includes(name) ? `「${name}」是保留的名字，换一个` : undefined
}

/** Saves what the session has on as an Agent: a new one, or over the named one. */
async function saveAgentFromSession($: EngineInterface, raw: string): Promise<void> {
  const name = cleanName(raw)
  const problem = nameProblem(name)
  if (problem !== undefined) {
    $.ui.toast(problem)
    return
  }
  const lib = await freshLibrary($)
  const isNew = !(name in lib.presets)
  const preset = toPreset(await current($), await groupsNow($))
  await saveLibrary($, { ...lib, presets: { ...lib.presets, [name]: preset } })
  if ((await read($, lock)) === null) {
    await update($, active, () => name)
    await remember($, { preset: name, allow: await read($, allow) })
  }
  $.ui.toast(isNew ? `已存为新 Agent「${name}」` : `已更新 Agent「${name}」`)
}

// Screens and the edits made on them.

async function go($: EngineInterface, next: View): Promise<void> {
  if (next === 'manage') await freshLibrary($)
  await update($, view, () => next)
  await update($, confirming, () => null)
  if (next !== 'agent') await update($, draft, () => null)
  if (next !== 'group') await update($, editGroup, () => null)
}

/** A destructive press asks for a second press of the same button first. */
async function confirmThen($: EngineInterface, key: string, run: () => Promise<void>): Promise<void> {
  if ((await read($, confirming)) !== key) {
    await update($, confirming, () => key)
    return
  }
  await update($, confirming, () => null)
  await run()
}

async function openAgentEditor($: EngineInterface, name: string | null): Promise<void> {
  const preset = name === null ? undefined : (await freshLibrary($)).presets[name]
  const selected = preset === undefined ? [] : resolvePreset(preset, await groupsNow($), await allNames($))
  await update($, draft, () => ({ original: preset === undefined ? null : name, name: name ?? '', selected }))
  await go($, 'agent')
}

async function setDraftName($: EngineInterface, value: string): Promise<void> {
  await update($, draft, old => (old === null ? old : { ...old, name: value.slice(0, MAX_NAME) }))
}

async function draftToggleSkill($: EngineInterface, name: string): Promise<void> {
  await update($, draft, old => {
    if (old === null) return old
    const isIn = old.selected.includes(name)
    return { ...old, selected: isIn ? old.selected.filter(one => one !== name) : [...old.selected, name] }
  })
}

async function draftSetGroup($: EngineInterface, group: Group, isOn: boolean): Promise<void> {
  await update($, draft, old => {
    if (old === null) return old
    const selected = new Set(old.selected)
    group.names.forEach(name => (isOn ? selected.add(name) : selected.delete(name)))
    return { ...old, selected: [...selected] }
  })
}

async function saveDraft($: EngineInterface): Promise<void> {
  const edited = await read($, draft)
  if (edited === null) return
  const name = cleanName(edited.name)
  const problem = nameProblem(name)
  if (problem !== undefined) {
    $.ui.toast(problem)
    return
  }
  const lib = await freshLibrary($)
  if (name !== edited.original && name in lib.presets) {
    $.ui.toast(`已经有叫「${name}」的 Agent 了`)
    return
  }
  const preset = toPreset(edited.selected, await groupsNow($))
  const entries = Object.entries(lib.presets).map(([key, value]) =>
    key === edited.original ? ([name, preset] as const) : ([key, value] as const),
  )
  const isNew = edited.original === null || !(edited.original in lib.presets)
  await saveLibrary($, { ...lib, presets: Object.fromEntries(isNew ? [...entries, [name, preset]] : entries) })
  if (!isNew && (await read($, active)) === edited.original) await update($, active, () => name)
  $.ui.toast(isNew ? `已新建 Agent「${name}」` : `已保存 Agent「${name}」`)
  await go($, 'manage')
}

async function removeAgent($: EngineInterface, name: string): Promise<void> {
  const lib = await freshLibrary($)
  const presets = Object.fromEntries(Object.entries(lib.presets).filter(([one]) => one !== name))
  await saveLibrary($, { ...lib, presets })
  if ((await read($, lock)) === null && (await read($, active)) === name) await update($, active, () => null)
}

async function createGroup($: EngineInterface, raw: string): Promise<void> {
  const label = cleanName(raw)
  if (label === '') return
  const lib = await freshLibrary($)
  if (label in lib.groups) {
    $.ui.toast(`已经有叫「${label}」的技能组了`)
    return
  }
  await saveLibrary($, { ...lib, groups: { ...lib.groups, [label]: [] } })
  await update($, editGroup, () => label)
  await go($, 'group')
}

async function openGroupEditor($: EngineInterface, label: string): Promise<void> {
  await update($, editGroup, () => label)
  await go($, 'group')
}

/** Puts a loose skill into the group, out of any other; or out of the group when it is in. */
async function toggleGroupMember($: EngineInterface, label: string, name: string): Promise<void> {
  const lib = await freshLibrary($)
  const group = (await groupsNow($, true)).find(one => one.id === `g:${label}`)
  const isMember = group?.names.includes(name) ?? false
  await saveLibrary($, { ...lib, groups: moveSkills(lib.groups, [name], isMember ? null : label) })
}

async function renameGroupTo($: EngineInterface, from: string, raw: string): Promise<void> {
  const to = cleanName(raw)
  const lib = await freshLibrary($)
  if (to === '' || to === from) return
  if (to in lib.groups) {
    $.ui.toast(`已经有叫「${to}」的技能组了`)
    return
  }
  await saveLibrary($, renameGroup(lib, from, to))
  await update($, expanded, old => old.map(id => id.replace(`:g:${from}`, `:g:${to}`)))
  await update($, editGroup, () => to)
  $.ui.toast(`已改名为「${to}」`)
}

async function removeGroup($: EngineInterface, label: string): Promise<void> {
  const lib = await freshLibrary($)
  const group = (await groupsNow($, true)).find(one => one.id === `g:${label}`)
  await saveLibrary($, deleteGroup(lib, label, group?.names ?? []))
  $.ui.toast(`已删除技能组「${label}」，里面的 skill 回到「未归组」`)
  await go($, 'manage')
}

async function resetLibrary($: EngineInterface): Promise<void> {
  const defaults = await read($, config)
  await freshLibrary($)
  await saveLibrary($, { groups: defaults.groups, presets: defaults.presets })
  $.ui.toast('Agent 和技能组已恢复成默认设置')
}

// The card: the person's first message waits while they pick the conversation's Agent.

/**
 * One line under each option of a card: what the Agent holds and how many
 * skills that comes to, led by the card's own note for it (`notes`).
 */
async function describer(
  $: EngineInterface,
  notes: Readonly<Record<string, string>>,
  isFirstMessage: boolean,
): Promise<(label: string) => string> {
  const skills = await read($, catalog)
  const lib = await read($, library)
  const names = skills.map(skill => skill.name)
  const groups = groupSkills(skills, lib.groups, true)
  const always = await alwaysNow($)
  const last = isFirstMessage ? await lastAgentHere($) : null
  const agentCount = offeredAgents(lib).length
  const line = (...parts: (string | undefined)[]): string => parts.filter(part => part !== undefined && part !== '').join(' · ')

  return label => {
    const note = notes[label]
    if (label === UNLIMITED) return line(note, names.length > 0 ? `装全部 ${names.length} 个 skill` : '装全部 skill')
    if (label === MORE) return `换下一批，一共 ${agentCount} 个 Agent`
    const preset = lib.presets[label]
    if (preset === undefined) return note ?? ''
    const count = new Set([...resolvePreset(preset, groups, names), ...always]).size
    return line(
      label === last ? '上次在这个文件夹用的' : note,
      agentSummary(preset, groups),
      names.length > 0 ? `${count} 个 skill` : undefined,
    )
  }
}

/** What a card came to: the option picked (null for none), and the answers as the host gave them. */
type CardResult = { picked: string | null; answers: string[]; outcome: string }

/**
 * Shows the card until an option is picked: 「更多 Agent…」 pages through the
 * pool, and an answer that names none asks again, a few times at most.
 */
async function askCard(
  $: EngineInterface,
  question: string,
  pool: readonly string[],
  fixed: readonly string[],
  agents: readonly string[],
): Promise<CardResult> {
  const answers: string[] = []
  let start = 0
  let misses = 0
  let asked = question
  for (let round = 0; round < MAX_ROUNDS && misses < MAX_MISSES; round += 1) {
    const page = askPage(pool, start, fixed)
    let answer: string
    try {
      answer = await $.ui.ask(asked, { header: TITLE, options: page.options })
    } catch {
      // Dismissed, or nobody to ask (a -p run).
      return { picked: null, answers, outcome: 'dismissed' }
    }
    answers.push(answer.slice(0, 300))
    const picked = pickOption(answer, page.options, agents)
    if (picked === MORE) {
      start = page.next
      asked = question
      continue
    }
    if (picked !== null) return { picked, answers, outcome: `picked ${picked}` }
    if (answer.trim() === '') return { picked: null, answers, outcome: 'empty answer' }
    misses += 1
    asked = `「${cleanName(answer)}」不是现成的 Agent，卡片上只能选一个。${question}`
  }

  return { picked: null, answers, outcome: 'nothing picked' }
}

/** The Agents a card offers: a hand-written library.json may name one like a card's own option. */
function offeredAgents(lib: Library): string[] {
  return Object.keys(lib.presets).filter(name => !RESERVED.includes(name))
}

/** Asks which Agent this conversation uses, on the card Claude asks its own questions on. */
async function askLoadout($: EngineInterface): Promise<CardResult> {
  const lib = await freshLibrary($)
  if (!(await read($, prefs)).askOnNewSession) return { picked: null, answers: [], outcome: 'off' }
  const agents = offeredAgents(lib)
  if (agents.length === 0) return { picked: null, answers: [], outcome: 'no agents' }
  await update($, asking, () => true)
  try {
    const card = await askCard($, ASK_QUESTION, agentOrder(agents, await lastAgentHere($)), [UNLIMITED], agents)
    if (card.picked !== null && (await applyAgent($, card.picked))) {
      const selection = await selectionNow($)
      const count = (await allNames($)).length > 0 ? `，共 ${selection.loaded.size} 个 skill` : ''
      $.ui.toast(`这个会话用「${selection.label}」${count}`)
    } else {
      // The conversation starts with what it has.
      $.ui.toast(`没有选技能装配，这个会话按「${(await selectionNow($)).label}」开始`)
    }
    return card
  } finally {
    await update($, chosen, () => true)
    await update($, asking, () => false)
  }
}

/** Asks the person which skills a subagent gets, the main agent's suggestion first; the spawn waits meanwhile. */
async function askSubagent(
  $: EngineInterface,
  task: Pick<SubLoadout, 'description' | 'prompt'>,
  suggested: string | null,
  parent: Held,
  isUnderMain: boolean,
): Promise<SubLoadout> {
  const agents = offeredAgents(await freshLibrary($))
  const same = isUnderMain ? SAME_AS_MAIN : SAME_AS_PARENT
  const first = suggested !== null && (agents.includes(suggested) || suggested === UNLIMITED) ? suggested : null
  const pool = [...(first === null ? [] : [first]), ...[...agents, UNLIMITED].filter(name => name !== first)]
  const question = `子代理「${task.description === '' ? '新任务' : task.description}」用哪套技能？`
  cardNotes.set(question, {
    [same]: `沿用「${parent.label}」`,
    ...(first === null ? {} : { [first]: '主代理建议' }),
  })
  try {
    const card = await askCard($, question, pool, [same], agents)
    const kept: SubLoadout = { ...task, allow: parent.allow, label: parent.label, by: 'inherit' }
    if (card.picked === null || card.picked === same) return kept
    return (await namedLoadout($, card.picked, { ...task, by: 'person' })) ?? kept
  } finally {
    cardNotes.delete(question)
  }
}

// The panel: opened on its own when a new session starts, unless the card asks instead;
// after the person closes it, only they reopen it.

async function openPane($: EngineInterface): Promise<{ isPlaced: boolean; reason?: string }> {
  await freshLibrary($)
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  if (opened.isPlaced) await update($, pane, () => 'open')

  return opened
}

/** Offers the panel until the app places it, while the session can still choose and nobody closed it. */
async function openWhenReady($: EngineInterface, tries = 6): Promise<void> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if ((await read($, pane)) !== 'never' || (await read($, lock)) !== null) return
    if (attempt > 0) await $.clock.sleep(1000 * 2 ** (attempt - 1))
    try {
      if ((await openPane($)).isPlaced) return
    } catch {
      // Not ready yet: the next attempt asks again.
    }
  }
}

/** A listing with only the loop's skills (and the always-on ones) left, and a note saying how many went. */
function limitListing(
  text: string,
  held: Held,
  names: readonly string[],
  alwaysOn: readonly string[],
  isSubagent: boolean,
): string {
  if (held.allow === null) return text
  const allowed = new Set([...held.allow, ...names.filter(name => matchesAny(alwaysOn, name))])
  const filtered = filterListing(text, allowed, names)
  if (filtered.hidden === 0) return filtered.text
  const note = hiddenNote(filtered.hidden, held.label, isSubagent)
  // A listing (often a delta of newly added skills) left with no entries keeps only the note.

  return listingNames(filtered.text, names).length === 0 ? note.trim() : filtered.text + note
}

function formatTokens(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Each step stands alone, so one that fails leaves the others working; what happened goes to the store.
    const diag: Record<string, unknown> = { surface: e.surface }
    const step = async (name: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        const value = await run()
        if (value !== undefined) diag[name] = value
      } catch (error) {
        diag[`${name}Error`] = String(error)
      }
    }
    await step('at', () => $.clock.now())
    await step('command', () =>
      $.command.register({
        name: 'loadout',
        description: `打开技能装配面板；发第一条消息前可用 /loadout <Agent 名> 直接切换（/loadout ${UNLIMITED} 装全部 skill）`,
        argumentHint: '[Agent 名]',
      }),
    )
    await step('tool', () => $.tool.register(LOADOUT_TOOL))
    await step('config', async () => {
      const loaded = await loadConfig($)
      await update($, config, () => loaded)
      return loaded.alwaysOn.length
    })
    await step('file', () => loadLibrary($))
    await update($, cwd, () => e.cwd)
    // A card left open by an earlier copy of this code is gone with it.
    await update($, asking, () => false)
    await step('catalog', async () => {
      await refreshCatalog($)
      return (await read($, catalog)).length
    })
    await step('catalogFile', () => writeCatalogFile($))
    await step('loadout', () => settleLoadout($))
    await step('sessionSurface', () => $.session.surface())
    const isAsked = (await read($, prefs)).askOnNewSession
    await step('placed', async () => {
      if ((await read($, pane)) === 'closed') return 'closed by the person'
      // Only a session that can still choose opens the panel on its own; a locked one has the bar above the prompt.
      if ((await read($, lock)) !== null) return 'locked: not opened'
      if (isAsked) return 'not opened: the first message asks'
      const opened = await openPane($)
      return opened.isPlaced || (opened.reason ?? false)
    })
    await step('diag', () => $.store.set('diag', diag))
    // At session start the app may not have attached its window yet: try again until it places the pane.
    if (!isAsked && (await read($, pane)) === 'never' && (await read($, lock)) === null) void openWhenReady($)

    return next(e)
  })

  // The first turn freezes the loadout for the rest of the session.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await lockSession($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Each reply of the main conversation's model, as it is stored: a fork keeps it word for word, and finds the lock by it.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || result.deny !== undefined) return result
    // An error the engine wrote in the model's place reads the same in any conversation: it tells none apart.
    if (e.origin.kind === 'model' && e.origin.model === '<synthetic>') return result
    const text = result.message.content
      .map(block => (block.type === 'text' && typeof block['text'] === 'string' ? block['text'] : ''))
      .join('\n')
    const mark = replyMark(text)
    if (mark !== undefined) await noteReply($, mark)
    return result
  }).catch(($, e, next) => next(e))

  // A /clear, or a resume in the same process, goes on under another session: that conversation settles its own.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      await update($, lock, () => null)
      await update($, chosen, () => false)
      await update($, asking, () => false)
      await update($, subagents, () => ({}))
      await update($, pending, () => [])
      // A cleared conversation's first listing tells the model about subagents again; a resumed one's history has it.
      await update($, briefed, () => e.reason === 'resume')
      // The conversation that follows has prompts of its own.
      await update($, anchors, () => [])
      // A resumed session gets its own lock back at its first turn, or keeps every skill when it had none.
      if (e.reason === 'resume') {
        await update($, allow, () => null)
        await update($, active, () => null)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__skill-loadout__loadout' }, async ($, e) => {
    const input = e as { action?: string }
    if (input.action === 'open') {
      const opened = await openPane($)
      const text = opened.isPlaced
        ? '技能装配面板已打开。'
        : `面板没能打开（${opened.reason ?? '界面没有放置它'}）。可以点输入框上方的「打开面板」，或输入 /loadout。`
      return { result: text, text }
    }
    const lib = await freshLibrary($)
    const skills = await read($, catalog)
    const names = skills.map(skill => skill.name)
    const groups = groupSkills(skills, lib.groups, true)
    const always = await alwaysNow($)
    const held = await read($, lock)
    const selection = await selectionNow($)
    const status = {
      current: held?.label ?? selection.label,
      locked: held !== null,
      loaded: selection.loaded.size,
      total: names.length,
      askOnNewSession: (await read($, prefs)).askOnNewSession,
      subagentPicker: (await read($, prefs)).subagentPicker,
      subagents: Object.fromEntries(
        Object.entries(await read($, subagents)).map(([id, one]) => [
          id,
          { task: one.description, set: one.label, by: one.by, skills: one.allow?.length ?? 'all' },
        ]),
      ),
      dataFile: await read($, dataFile),
      agents: Object.fromEntries(
        Object.entries(lib.presets).map(([name, preset]) => [
          name,
          {
            groups: preset.groups.map(id => groupLabel(id, groups)),
            skills: preset.skills,
            count: new Set([...resolvePreset(preset, groups, names), ...always]).size,
          },
        ]),
      ),
      groups: groups.map(group => ({ group: group.label, kind: group.kind, count: group.names.length })),
      looseGroups: Object.fromEntries(
        groups.filter(group => group.kind !== 'fixed').map(group => [group.label, group.names]),
      ),
      diag: await $.store.get('diag'),
      lastAsk: await $.store.get('lastAsk'),
    }
    const text = JSON.stringify(status, null, 2)
    return { result: text, text }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'loadout' }, async ($, e) => {
    const typed = e.args.trim()
    if (typed === '') {
      await openPane($)
      return { text: '技能装配面板已打开。' }
    }
    const held = await read($, lock)
    if (held !== null) return { text: lockedText(held.label) }
    const agents = offeredAgents(await freshLibrary($))
    // The name as typed; else one the text starts with, as when more words follow it.
    const first = typed.split('\n')[0]?.trim() ?? ''
    const name =
      answerAgent(typed, agents) ??
      answerAgent(first, agents) ??
      [...agents, UNLIMITED].filter(one => first.toLowerCase().startsWith(one.toLowerCase())).sort((a, b) => b.length - a.length)[0] ??
      null
    if (name !== null && (await applyAgent($, name))) {
      return { text: `这个会话改用「${name}」，发出第一条消息后锁定。` }
    }

    return { text: `没有叫「${first}」的 Agent。可用的有：${[UNLIMITED, ...agents].join('、')}` }
  })

  // The person's first message in a new conversation waits, before the model reads anything, while they
  // pick the conversation's Agent on a card: nothing is listed yet, so no cache is broken.
  on('prompt.submit', async ($, e, next) => {
    // The person's own words, for the skills and the sets they name.
    if (PERSON_ORIGINS.has(e.origin.kind)) await update($, lastPrompt, () => e.text.slice(0, 4000))
    if ((await read($, lock)) === null) {
      let outcome: string
      let answers: string[] = []
      if (await read($, chosen)) outcome = 'already chosen'
      else if (await read($, asking)) outcome = 'the card is already open'
      else if (!PERSON_ORIGINS.has(e.origin.kind)) outcome = 'not from a person'
      else if (e.command?.name === 'loadout') outcome = 'the /loadout command'
      else if (await hasHistory($)) outcome = 'has history'
      else {
        const card = await askLoadout($)
        outcome = card.outcome
        answers = card.answers
      }
      // The answers as the host gave them, for when a pick is not understood.
      const at = await nowOr0($)
      await $.store.set('lastAsk', { origin: e.origin.kind, command: e.command?.name ?? null, outcome, answers, at })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A subagent's skills are settled as it is spawned and kept: a fork keeps its parent's; any other takes the set
  // the main agent names in its prompt (`技能装配：<name>`), or the person's pick on a card when they choose, else
  // its parent's.
  on('agent.spawn', async ($, e, next) => {
    if (e.resume !== undefined) return next(e)
    const parent = await loadoutOf($, e.parentAgentId)
    const task = { description: e.description, prompt: e.prompt.slice(0, 4000) }
    const isFork = e.fork || e.subagentType === 'fork'
    let decided: SubLoadout = { ...task, allow: parent.allow, label: parent.label, by: isFork ? 'fork' : 'inherit' }
    if (!isFork) {
      const agents = offeredAgents(await freshLibrary($))
      const named = markerName(e.prompt)
      // The main agent's line; else, for a spawn of the main conversation, the set the person's latest message names.
      const fromLine = named === null ? null : pickOption(named, [...agents, UNLIMITED], agents)
      const fromPerson =
        fromLine === null && e.parentAgentId === undefined ? setNamedIn(await read($, lastPrompt), agents) : null
      const suggested = fromLine ?? fromPerson
      if ((await read($, prefs)).subagentPicker === 'person' && e.workflow === undefined) {
        decided = await askSubagent($, task, suggested, parent, e.parentAgentId === undefined)
      } else if (suggested !== null) {
        decided = (await namedLoadout($, suggested, { ...task, by: fromLine !== null ? 'agent' : 'person' })) ?? decided
      }
    }
    if (e.tool_use_id !== '') spawnedSets.set(e.tool_use_id, decided)
    const key = spawnKey(e.parentAgentId, e.subagentType, e.description)
    await update($, pending, old => [...old, { key, loadout: decided }])
    try {
      // A subagent given a set of its own is told which skills it holds, whether or not a listing reaches it.
      const isOwn = (decided.by === 'agent' || decided.by === 'person') && decided.allow !== null
      const result = await next(isOwn ? { ...e, prompt: e.prompt + loadoutNote(decided.label, decided.allow ?? []) } : e)
      if (result.agentId !== undefined) await recordSubagent($, result.agentId, decided)
      return result
    } finally {
      await update($, pending, old => {
        const at = old.findIndex(one => one.key === key)
        return at < 0 ? old : [...old.slice(0, at), ...old.slice(at + 1)]
      })
    }
  }).catch(($, e, next) => next(e))

  // The main agent reads which set the subagent it started got, so that it tells the user right.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const result = await next(e)
    const settled = spawnedSets.get(e.tool_use_id)
    spawnedSets.delete(e.tool_use_id)
    if (result.deny !== undefined || settled === undefined) return result
    if (settled.by !== 'agent' && settled.by !== 'person') return result
    // Counted as the panel counts it: the set's skills and the always-on ones.
    const size = settled.allow === null ? null : new Set([...settled.allow, ...(await alwaysNow($))]).size
    const note = spawnedNote(settled.label, size, settled.by === 'person')

    return { ...result, context: [...(result.context ?? []), note] }
  }).catch(($, e, next) => next(e))

  // The cards' options say what each Agent holds.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const [first, ...rest] = e.questions
    if (first === undefined || first.header !== TITLE) return next(e)
    const notes = [...cardNotes.entries()].find(([question]) => first.question.endsWith(question))?.[1] ?? {}
    const describe = await describer($, notes, first.question.endsWith(ASK_QUESTION))
    const options = first.options.map(option => {
      const description = describe(option.label)
      return description === '' ? option : { ...option, description }
    })

    return next({ ...e, questions: [{ ...first, options }, ...rest] })
  }).catch(($, e, next) => next(e))

  // The person closed the panel: from now on the bar above the prompt offers it back.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind !== 'unload') await update($, pane, () => 'closed')
    return next(e)
  }).catch(($, e, next) => next(e))

  // One quiet row above the prompt while the panel is not open: what is loaded, and a way back.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, pane)) === 'open') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const total = (await read($, catalog)).length
    const held = await read($, lock)
    const selection = await selectionNow($)
    const isAsked = (await read($, prefs)).askOnNewSession && !(await read($, chosen))
    const state =
      held !== null
        ? '已锁定'
        : (await read($, asking))
          ? '正在问你用哪套'
          : isAsked
            ? '发第一条消息时会问你'
            : '发第一条消息前可改'

    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>技能装配</Text>
          <Text weight="semibold">{held?.label ?? selection.label}</Text>
          <Text dimColor tabular>{`${selection.loaded.size}/${total}`}</Text>
          <Text dimColor>{state}</Text>
        </Box>
        <Button key="band:open" label="打开面板" onPress={() => openPane($)} />
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The heart of it: the listing the model reads keeps only the skills this session loads.
  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const result = await next(e)
    if (result.text === null) return result
    const known = await allNames($)
    const found = listingNames(result.text, known).filter(name => !known.includes(name))
    await addToCatalog($, found.map(name => ({ name })))
    if (found.length > 0) {
      try {
        await writeCatalogFile($)
      } catch {
        // The file is a courtesy to other tools; the listing goes on without it.
      }
    }
    const { alwaysOn } = await read($, config)
    const names = [...known, ...found]
    // A subagent's listing keeps the skills its spawn settled.
    if (e.agentId !== undefined) return { text: limitListing(result.text, await loadoutOf($, e.agentId), names, alwaysOn, true) }
    let list = await read($, allow)
    // An Agent chosen before the skills were known is worked out again now that they are.
    const agent = await read($, active)
    if (known.length === 0 && found.length > 0 && list !== null && agent !== null) {
      const preset = (await read($, library)).presets[agent]
      if (preset !== undefined) {
        const resolved = resolvePreset(preset, await groupsNow($), await allNames($))
        list = resolved
        await update($, allow, () => resolved)
        const held = await read($, lock)
        if (held !== null) await saveLock($, held)
      }
    }
    let text = limitListing(result.text, { allow: list, label: (await mainLoadout($)).label }, names, alwaysOn, false)
    // The conversation's first listing also tells the model how subagents get their skills.
    if (!(await read($, briefed))) {
      await update($, briefed, () => true)
      text += await briefing($)
    }

    return { text }
  }).catch(($, e, next) => next(e))

  // A skill left out of a loop's loadout is refused when its model reaches for it unasked.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const held = await loadoutOf($, e.agentId)
    if (held.allow === null || held.allow.includes(e.skill)) return next(e)
    const { alwaysOn } = await read($, config)
    // Named outright: by the person for the main conversation, in its task for a subagent.
    const asked =
      e.agentId === undefined ? await read($, lastPrompt) : ((await read($, subagents))[e.agentId]?.prompt ?? '')
    if (asked.includes(e.skill) || matchesAny(alwaysOn, e.skill)) return next(e)
    if (e.agentId !== undefined) {
      return {
        deny:
          `「${e.skill}」不在这个子代理的技能装配（${held.label}）里。只用装配给你的 skill；` +
          '确实需要它的话，在交回的结果里说明需要哪个 skill。',
      }
    }

    return {
      deny:
        `「${e.skill}」没有装配到这个会话，而这个会话的装配已经锁定。不要换个名字再试；` +
        '如果确实需要它，告诉用户在消息里写出这个 skill 的名字就能临时使用。',
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const skills = await read($, catalog)
    const lib = await read($, library)
    const list = await read($, allow)
    const screen = await read($, view)
    const open = await read($, expanded)
    const pending = await read($, confirming)
    const held = await read($, lock)
    const settings = await read($, prefs)
    const file = await read($, dataFile)
    const isChosen = await read($, chosen)
    const isAsking = await read($, asking)
    const subs = Object.values(await read($, subagents))
    const names = skills.map(skill => skill.name)
    const always = new Set(await alwaysNow($))
    const groups = groupSkills(skills, lib.groups)
    const groupsAll = groupSkills(skills, lib.groups, true)
    const agentNames = Object.keys(lib.presets)
    const toggleOpen = (id: string) =>
      update($, expanded, old => (old.includes(id) ? old.filter(one => one !== id) : [...old, id]))

    const sectionTitle = (title: string, hint?: string) => (
      <Box flexDirection="column">
        <Text weight="semibold">{title}</Text>
        {hint !== undefined && (
          <Text size="caption" dimColor>
            {hint}
          </Text>
        )}
      </Box>
    )

    const screenHeader = (backKey: string, backLabel: string, back: View, title: string) => (
      <Box flexDirection="row" alignItems="center" columnGap={1}>
        <Button key={backKey} label={backLabel} onPress={() => go($, back)} />
        <Text size="heading" weight="semibold">
          {title}
        </Text>
      </Box>
    )

    const countText = (onCount: number, size: number): string =>
      onCount === 0 || onCount === size ? String(size) : `${onCount}/${size}`
    const glyphOf = (onCount: number, size: number): string =>
      onCount === size ? '☑' : onCount === 0 ? '☐' : '▣'
    const tagOf = (group: Group): string => (group.tag !== undefined ? ` · ${group.tag}` : '')

    /** Groups with a box each: tick a whole group, or open it and tick its skills one by one. */
    const checklist = (
      prefix: string,
      selected: ReadonlySet<string>,
      onGroup: (group: Group, isOn: boolean) => unknown,
      onSkill: (name: string) => unknown,
    ) =>
      groups
        .filter(group => group.names.length > 0)
        .map(group => {
          const onCount = group.names.filter(name => selected.has(name)).length
          const isFull = onCount === group.names.length
          const openId = `${prefix}:${group.id}`
          const isOpen = open.includes(openId)

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                <Box flexDirection="row" alignItems="center" columnGap={1}>
                  <Button
                    key={`${prefix}:tg:${group.id}`}
                    plain
                    label={glyphOf(onCount, group.names.length)}
                    onPress={() => onGroup(group, !isFull)}
                  />
                  <Button key={`${prefix}:op:${group.id}`} plain onPress={() => toggleOpen(openId)}>
                    {group.label}
                    <Text dimColor>{`${tagOf(group)}  ${isOpen ? '▾' : '▸'}`}</Text>
                  </Button>
                </Box>
                <Text dimColor tabular>
                  {countText(onCount, group.names.length)}
                </Text>
              </Box>
              {isOpen && (
                <Box flexDirection="column" paddingLeft={3}>
                  {group.names.map(name =>
                    always.has(name) ? (
                      <Text dimColor>{`☑  ${name}  常驻`}</Text>
                    ) : (
                      <Button
                        key={`${prefix}:sk:${group.id}:${name}`}
                        plain
                        dimColor={!selected.has(name)}
                        onPress={() => onSkill(name)}
                      >
                        {selected.has(name) ? '☑  ' : '☐  '}
                        {name}
                      </Button>
                    ),
                  )}
                </Box>
              )}
            </Box>
          )
        })

    /** The same groups, to look at only: what the locked session has, and what it left out. */
    const readonlyList = (selected: ReadonlySet<string>) =>
      groups
        .filter(group => group.names.length > 0)
        .map(group => {
          const onCount = group.names.filter(name => selected.has(name)).length
          const openId = `l:${group.id}`
          const isOpen = open.includes(openId)

          return (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                <Button key={`l:op:${group.id}`} plain dimColor={onCount === 0} onPress={() => toggleOpen(openId)}>
                  {`${glyphOf(onCount, group.names.length)}  `}
                  {group.label}
                  <Text dimColor>{`${tagOf(group)}  ${isOpen ? '▾' : '▸'}`}</Text>
                </Button>
                <Text dimColor tabular>
                  {countText(onCount, group.names.length)}
                </Text>
              </Box>
              {isOpen && (
                <Box flexDirection="column" paddingLeft={3}>
                  {group.names.map(name => (
                    <Text dimColor={!selected.has(name)}>
                      {`${selected.has(name) ? '☑' : '☐'}  ${name}${always.has(name) ? '  常驻' : ''}`}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          )
        })

    // The Agent editor: a name and the same checklist, on a draft the session does not see.
    if (screen === 'agent') {
      const edited = await read($, draft)
      if (edited === null) {
        return (
          <Box flexDirection="column" rowGap="md">
            {screenHeader('agent-cancel', '← 返回', 'manage', 'Agent')}
            <Text dimColor>没有正在编辑的 Agent</Text>
          </Box>
        )
      }
      const shown = new Set([...edited.selected, ...always])

      return (
        <Box flexDirection="column" rowGap="lg">
          {screenHeader('agent-cancel', '← 取消', 'manage', edited.original === null ? '新建 Agent' : '编辑 Agent')}
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('名字')}
            <Input
              key={`agent-name:${edited.original ?? ''}`}
              value={edited.name}
              placeholder="视频制作"
              onInput={value => setDraftName($, value)}
              onSubmit={() => saveDraft($)}
            />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('装哪些技能组', '勾整组，或者点组名展开、勾单个 skill')}
            {checklist('a', shown, (group, isOn) => draftSetGroup($, group, isOn), name => draftToggleSkill($, name))}
          </Box>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
            <Text dimColor>{`已选 ${names.filter(name => shown.has(name)).length} 个（含 ${always.size} 个常驻）`}</Text>
            <Button key="agent-save" variant="primary" label="保存" onPress={() => saveDraft($)} />
          </Box>
        </Box>
      )
    }

    // The group editor: only loose skills, each in at most one group.
    if (screen === 'group') {
      const label = await read($, editGroup)
      const group = groupsAll.find(one => one.id === `g:${label ?? ''}`)
      if (label === null || group === undefined) {
        return (
          <Box flexDirection="column" rowGap="md">
            {screenHeader('group-done', '← 返回', 'manage', '技能组')}
            <Text dimColor>这个技能组已经不在了</Text>
          </Box>
        )
      }
      const loose = skills.filter(isLoose).map(skill => skill.name)
      const homeOf = new Map(
        groupsAll.filter(one => one.kind === 'custom').flatMap(one => one.names.map(name => [name, one.label] as const)),
      )
      const rank = (name: string): number => (group.names.includes(name) ? 0 : homeOf.has(name) ? 2 : 1)
      const ordered = [...loose].sort((a, b) => rank(a) - rank(b))
      const deleteKey = `group:${label}`
      const isPending = pending === deleteKey

      return (
        <Box flexDirection="column" rowGap="lg">
          {screenHeader('group-done', '← 完成', 'manage', '编辑技能组')}
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('名字', '改完按回车')}
            <Input key={`group-name:${label}`} value={label} onSubmit={value => renameGroupTo($, label, value)} />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(
              `成员 ${group.names.length} 个`,
              '勾选零碎装的 skill 放进这个组。一个 skill 只能在一个组里，勾选会把它从原来的组移过来',
            )}
            {loose.length === 0 && <Text dimColor>没有零碎装的 skill</Text>}
            {ordered.map(name => {
              const isMember = group.names.includes(name)
              const home = homeOf.get(name)

              return (
                <Button key={`member:${name}`} plain dimColor={!isMember} onPress={() => toggleGroupMember($, label, name)}>
                  {isMember ? '☑  ' : '☐  '}
                  {name}
                  <Text dimColor>{!isMember && home !== undefined ? `  在 ${home}` : ''}</Text>
                </Button>
              )
            })}
          </Box>
          <Button
            key="group-delete"
            plain
            dimColor={!isPending}
            label={isPending ? '确认删除这个技能组？再点一次' : '删除这个技能组'}
            onPress={() => confirmThen($, deleteKey, () => removeGroup($, label))}
          />
        </Box>
      )
    }

    // The manage screen: Agents, groups of loose skills, what came already grouped, and the settings.
    if (screen === 'manage') {
      const custom = groupsAll.filter(group => group.kind === 'custom')
      const ungrouped = groupsAll.find(group => group.kind === 'ungrouped')
      const fixed = groupsAll.filter(group => group.kind === 'fixed')
      const fileProblem =
        file.status === 'invalid'
          ? `文件格式有误（${file.error ?? '读不懂'}）。现在用的是上次读到的设置；在这里改动会用这些设置覆盖这个文件`
          : file.status === 'unreadable'
            ? `读不了这个文件（${file.error ?? '原因不明'}），现在用的是上次读到的设置`
            : file.status === 'unwritable'
              ? `写不进这个文件（${file.error ?? '原因不明'}），改动只存在插件自己的存储里`
              : undefined

      return (
        <Box flexDirection="column" rowGap="lg">
          <Box flexDirection="column" rowGap="xs">
            {screenHeader('back', '← 返回', 'main', '管理')}
            {held !== null && (
              <Text size="caption" dimColor>
                这个会话已经锁定，这里的修改从下一个新会话起生效
              </Text>
            )}
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('Agent', '由技能组和单个 skill 拼成；新会话发第一条消息时选一个')}
            {agentNames.length === 0 && <Text dimColor>还没有 Agent</Text>}
            {agentNames.map(name => {
              const preset = lib.presets[name] ?? { groups: [], skills: [] }
              const isPending = pending === `agent:${name}`

              return (
                <Box flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                    <Text weight="semibold">{name}</Text>
                    <Box flexDirection="row" columnGap={1}>
                      <Button key={`edit-agent:${name}`} plain label="编辑" onPress={() => openAgentEditor($, name)} />
                      <Button
                        key={`del-agent:${name}`}
                        plain
                        dimColor={!isPending}
                        label={isPending ? '确认删除？' : '删除'}
                        onPress={() => confirmThen($, `agent:${name}`, () => removeAgent($, name))}
                      />
                    </Box>
                  </Box>
                  <Text size="caption" dimColor>
                    {agentSummary(preset, groupsAll)}
                  </Text>
                </Box>
              )
            })}
            <Button key="new-agent" label="＋ 新建 Agent" onPress={() => openAgentEditor($, null)} />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('技能组', '把零碎装的 skill 归在一起')}
            {custom.map(group => {
              const isPending = pending === `group:${group.label}`

              return (
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                  <Box flexDirection="row" columnGap={1}>
                    <Text>{group.label}</Text>
                    <Text dimColor tabular>
                      {group.names.length === 0 ? '空' : String(group.names.length)}
                    </Text>
                  </Box>
                  <Box flexDirection="row" columnGap={1}>
                    <Button key={`edit-group:${group.label}`} plain label="编辑" onPress={() => openGroupEditor($, group.label)} />
                    <Button
                      key={`del-group:${group.label}`}
                      plain
                      dimColor={!isPending}
                      label={isPending ? '确认删除？' : '删除'}
                      onPress={() => confirmThen($, `group:${group.label}`, () => removeGroup($, group.label))}
                    />
                  </Box>
                </Box>
              )
            })}
            <Input key="new-group" placeholder="新技能组名，回车创建" onSubmit={value => createGroup($, value)} />
            <Text size="caption" dimColor>
              {ungrouped === undefined ? '零碎装的 skill 都已归组' : `还有 ${ungrouped.names.length} 个零碎装的 skill 没归组`}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('插件和 Claude 自带的 skill', '装的时候就分好组了，不能调整；建 Agent 时可以整组勾选')}
            {fixed.length === 0 && <Text dimColor>没有</Text>}
            {fixed.map(group => (
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                <Box flexDirection="row" columnGap={1}>
                  <Text>{group.label}</Text>
                  <Text dimColor>{group.tag ?? ''}</Text>
                </Box>
                <Text dimColor tabular>
                  {String(group.names.length)}
                </Text>
              </Box>
            ))}
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('新会话', '发第一条消息时，先弹卡片问这个会话用哪套技能，选好 Claude 才开始读消息')}
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text>先问我用哪套</Text>
              <Button
                key="ask-toggle"
                variant={settings.askOnNewSession ? 'primary' : 'secondary'}
                label={settings.askOnNewSession ? '开' : '关'}
                onPress={() => setAsk($, !settings.askOnNewSession)}
              />
            </Box>
            {!settings.askOnNewSession && (
              <Text size="caption" dimColor>
                关着的时候，新会话会自动打开这个面板，发第一条消息前在这里选；不选就是「不限制」
              </Text>
            )}
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('子代理', '主代理开子代理时，子代理用哪套技能；fork 出来的总是沿用上级')}
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text>由谁来选</Text>
              <Button
                key="subagent-picker"
                variant={settings.subagentPicker === 'person' ? 'primary' : 'secondary'}
                label={settings.subagentPicker === 'person' ? '我来选' : '主代理'}
                onPress={() => setSubagentPicker($, settings.subagentPicker === 'person' ? 'agent' : 'person')}
              />
            </Box>
            <Text size="caption" dimColor>
              {settings.subagentPicker === 'person'
                ? '每开一个子代理都弹卡片问你，主代理建议的排第一'
                : '主代理在子代理的任务里写一行「技能装配：名字」来指定；不写就沿用主会话'}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('数据文件', 'Agent、技能组和上面的设置都存在这里，可以直接编辑，别的工具也能读')}
            <Text size="caption">{file.path === '' ? '没找到用户目录，只存在插件自己的存储里' : file.path}</Text>
            {fileProblem !== undefined && (
              <Text size="caption" color="warning">
                {fileProblem}
              </Text>
            )}
          </Box>
          <Button
            key="reset"
            plain
            dimColor={pending !== 'reset'}
            label={pending === 'reset' ? 'Agent 和技能组都会恢复成默认，再点一次确认' : '恢复默认设置'}
            onPress={() => confirmThen($, 'reset', () => resetLibrary($))}
          />
        </Box>
      )
    }

    // The main screen.
    const selection = describeSelection(names, groups, lib, list, await read($, active), [...always])
    const tokensOf = new Map(skills.map(skill => [skill.name, skill.tokens ?? 0]))
    const tokensIn = (members: readonly string[]): number =>
      members.reduce((sum, name) => sum + (tokensOf.get(name) ?? 0), 0)
    const totalTokens = tokensIn(names)
    const loadedTokens = tokensIn(names.filter(name => selection.loaded.has(name)))
    const tokenText =
      totalTokens > 0 ? ` · 清单约 ${formatTokens(loadedTokens)} / ${formatTokens(totalTokens)} tokens` : ''
    const loadedLine = `已装配 ${selection.loaded.size} / ${names.length} 个 skill${tokenText}`
    const manageButton = <Button key="manage" label="管理" onPress={() => go($, 'manage')} />

    // Locked: what the session has, to look at; how to use a skill it left out; how to get another loadout.
    if (held !== null) {
      const example = names.find(name => !selection.loaded.has(name))

      return (
        <Box flexDirection="column" rowGap="lg">
          <Box flexDirection="column" rowGap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text size="heading" weight="semibold">
                {held.label}
              </Text>
              {manageButton}
            </Box>
            <Text color="success">● 已锁定：这个会话不再改装配</Text>
            <Text size="caption" dimColor>
              {loadedLine}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle('装配情况', '点组名可以看里面每个 skill')}
            {readonlyList(selection.loaded)}
            {always.size > 0 && (
              <Text size="caption" dimColor>
                {`另有 ${always.size} 个常驻 skill 始终装配`}
              </Text>
            )}
          </Box>
          {subs.length > 0 && (
            <Box flexDirection="column" rowGap="xs">
              {sectionTitle('子代理', '每个子代理开出来时定下的技能，之后不变')}
              {subs
                .slice(-6)
                .reverse()
                .map(one => (
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                    <Text>{one.description === '' ? '子代理' : one.description}</Text>
                    <Text dimColor>{`${one.label} · ${SETTLED_BY[one.by]}`}</Text>
                  </Box>
                ))}
            </Box>
          )}
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX="md" paddingY="sm" rowGap="sm">
            {example !== undefined && (
              <Box flexDirection="column">
                <Text>临时要用没装配的 skill</Text>
                <Text size="caption" dimColor>{`在消息里写出它的名字就能用，比如 ${example}`}</Text>
              </Box>
            )}
            <Box flexDirection="column">
              <Text>想换一组 skill</Text>
              <Text size="caption" dimColor>
                {settings.askOnNewSession ? '新开一个会话，发第一条消息时会问你用哪套' : '新开一个会话，发第一条消息前在这里选'}
              </Text>
            </Box>
          </Box>
        </Box>
      )
    }

    // The card is open in the conversation: the choice is made there.
    if (isAsking) {
      return (
        <Box flexDirection="column" rowGap="lg">
          <Box flexDirection="column" rowGap="xs">
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text size="heading" weight="semibold">
                {TITLE}
              </Text>
              {manageButton}
            </Box>
            <Text color="warning">● 对话里正在问你这个会话用哪套技能</Text>
            <Text size="caption" dimColor>
              在那张卡片上选就行，选好之后 Claude 才开始读你的消息
            </Text>
          </Box>
        </Box>
      )
    }

    // Before the first message: pick an Agent, then adjust its groups for this session.
    const basedOn = selection.basedOn
    const isModified = !selection.isAll && selection.matched === null
    const status =
      names.length === 0
        ? { text: '还没读到已安装的 skill，可以先选 Agent', color: 'subtle' }
        : { text: '发第一条消息前可以改，发出后就锁定', color: 'warning' }
    const radio = (key: string, name: string, isOn: boolean, count: string, onPress: () => unknown) => (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
        <Button key={key} plain onPress={onPress}>
          {isOn ? '◉  ' : '○  '}
          <Text weight={isOn ? 'semibold' : 'regular'}>{name}</Text>
        </Button>
        <Text dimColor tabular>
          {count}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" rowGap="lg">
        <Box flexDirection="column" rowGap="xs">
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
            <Text size="heading" weight="semibold">
              {selection.label}
            </Text>
            {manageButton}
          </Box>
          <Text color={status.color}>{`● ${status.text}`}</Text>
          <Text size="caption" dimColor>
            {loadedLine}
          </Text>
          {settings.askOnNewSession && !isChosen && (
            <Text size="caption" dimColor>
              不在这里选也行：发第一条消息时会弹卡片问你
            </Text>
          )}
        </Box>
        <Box flexDirection="column" rowGap="xs">
          {sectionTitle('① 这个会话用哪个 Agent')}
          {agentNames.map(name => {
            const preset = lib.presets[name] ?? { groups: [], skills: [] }
            const size = new Set([...resolvePreset(preset, groups, names), ...always]).size
            return radio(`agent:${name}`, name, selection.matched === name, String(size), () => applyAgent($, name))
          })}
          {radio('agent:__all', UNLIMITED, selection.isAll, `全部 ${names.length}`, () => applyAgent($, UNLIMITED))}
          {agentNames.length === 0 && (
            <Text size="caption" dimColor>
              还没有 Agent：点右上角「管理」新建
            </Text>
          )}
        </Box>
        {isModified && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX="md" paddingY="sm" rowGap="xs">
            <Text>{basedOn !== null ? `在「${basedOn}」基础上改过` : '现在的装配和哪个 Agent 都不一样'}</Text>
            <Text size="caption" dimColor>
              {basedOn !== null ? '点上面的 Agent 可以重新套用；想留下这次的改动：' : '想留下这次的装配：'}
            </Text>
            {basedOn !== null && (
              <Button key="update-agent" label={`存进「${basedOn}」`} onPress={() => saveAgentFromSession($, basedOn)} />
            )}
            <Input key="save-agent" placeholder="新 Agent 名，回车保存" onSubmit={value => saveAgentFromSession($, value)} />
          </Box>
        )}
        <Box flexDirection="column" rowGap="xs">
          {sectionTitle('② 装了哪些技能组', '发第一条消息前可以增减')}
          {checklist('m', selection.loaded, (group, isOn) => setGroup($, group, isOn), name => toggleSkill($, name))}
          {always.size > 0 && (
            <Text size="caption" dimColor>
              {`另有 ${always.size} 个常驻 skill 始终装配`}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
