import { atom, read, update } from 'claude-code'
import type { EngineInterface, JsonValue, Register } from 'claude-code'

import type {
  AgentDraft,
  DataFile,
  Library,
  LoadoutConfig,
  NextSession,
  PaneState,
  PendingSpawn,
  Preset,
  Prefs,
  SessionLock,
  SkillEntry,
  StoredLock,
  SubLoadout,
  View,
} from '../types'
import { WORDS, asLang, languageFromSetting, languageOf, type Lang, type Words } from './i18n'
import {
  ALL_WORDS,
  ASK_QUESTIONS,
  CLIENT_LABELS,
  DEFAULT_CONFIG,
  DEFAULT_PREFS,
  MAX_NAME,
  MORE_LABELS,
  RESERVED_NAMES,
  UNLIMITED,
  agentSummary,
  answerAgent,
  applyChanges,
  changeForModel,
  askPage,
  deleteGroup,
  describeSelection,
  filterListing,
  folderKey,
  groupLabel,
  groupSkills,
  hiddenNote,
  isClientWord,
  isLoose,
  keepUnseen,
  libraryFileText,
  libraryReport,
  listingDescriptions,
  listingNames,
  loadoutNote,
  markerName,
  matchesAny,
  mergeSeen,
  sameCatalog,
  setMember,
  normalizeConfig,
  pickOption,
  plainName,
  promptMark,
  rankChoices,
  readLibraryFile,
  readNextSession,
  renameGroup,
  resolvePreset,
  setChanges,
  setNamedIn,
  spawnedNote,
  subagentBrief,
  toPreset,
  usedNextSession,
} from './listing'
import type { Group, Selection } from './listing'

const PANE = 'skill-loadout'
/** The card's header in either language: how this plugin's cards are told from others. */
const CARD_HEADERS: readonly string[] = [WORDS.zh.cardHeader, WORDS.en.cardHeader]
/** Names an Agent may not take: they mean something else on the card. */
const RESERVED = RESERVED_NAMES
/** The store's key for the language `auto` last came to, for the panel before a session's first message. */
const LANGUAGE_KEY = 'language'
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
/** The set the tray client prepared for the next session; the card offers it, and marks it once a session takes it. */
const NEXT_FILE = 'next-session.json'
/** Written by the tray client as it starts: the card tells the person how to reach a set prepared there. */
const CLIENT_FILE = 'client.json'
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
const prefs = atom({ plugin: 'skill-loadout', key: 'prefs' } as const, DEFAULT_PREFS, { shape: 'prefs-2' })
const extra = atom({ plugin: 'skill-loadout', key: 'extra' } as const, {} as Record<string, JsonValue>, { shape: 'extra-1' })
const prepared = atom({ plugin: 'skill-loadout', key: 'prepared' } as const, null as Preset | null, { shape: 'prepared-1' })
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
const detected = atom({ plugin: 'skill-loadout', key: 'detected' } as const, null as Lang | null, { shape: 'detected-1' })

type Remembered = { preset: string | null; allow: string[] | null }
/** library.json as read: the groups and Agents, the settings, and the fields other tools keep there. */
type LibraryValue = { library: Library; prefs: Prefs; extra: Record<string, unknown> }
/** The client's prepared set as a card offers it, with next-session.json as it was read. */
type Prepared = { next: NextSession; raw: Record<string, unknown> }
/** One round of a card, read anew each time it shows: what it asks, its options, and the lines under them. */
type CardRound = {
  question: string
  /** Put before the question, unless the card already leads with why it asks again. */
  hint?: string
  /** Every option in the order the card offers them; a page holds four, or three beside 「更多 Agent…」. */
  pool: readonly string[]
  agents: readonly string[]
  notes: Record<string, string>
  /** The main conversation's card, which marks the Agent last used in this folder. */
  isMain: boolean
}
/** A loop's skills: every one when `allow` is null. */
type Held = { allow: string[] | null; label: string }

/**
 * Lines under the card's options beside what each Agent holds, by the card's
 * question as asked: what 「和主会话一样」 keeps, which option the main agent
 * suggested, what the client prepared; and whether it is the main card.
 */
const cardNotes = new Map<string, Pick<CardRound, 'notes' | 'isMain'> & { isPlain?: boolean }>()

/** The sets spawns settled, by the Agent call that asked for each, until that call's result goes back. */
const spawnedSets = new Map<string, SubLoadout>()

const TEXT_LIST = { type: 'array', items: { type: 'string' } }

const LOADOUT_TOOL = {
  name: 'loadout',
  description:
    "Lodestar (skill loadout) keeps the user's Agents, named sets of skills (the user picks one on a card when a " +
    "conversation's first message is sent, and the conversation keeps it), and their categories, their own groups " +
    'of skills installed on their own. Actions: "list": every installed skill with what it does, the groups it is ' +
    'in (by id) and the Agents that load it, then the categories and Agents; read it before "save". "save": change ' +
    'categories and Agents; tell the user the plan first, then they confirm the exact changes on a card before ' +
    'anything is written. New conversations get the change; this one keeps its skills. "undo": put back what the ' +
    'last "save" changed, also confirmed on a card. "status": this session\'s skills and diagnostics. "open": open ' +
    'the Lodestar panel.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'save', 'undo', 'status', 'open'] },
      categories: {
        type: 'object',
        description:
          'save: category name to the whole list of skills it holds from now on (names, or patterns with *; "!name" ' +
          'leaves one out), or null to delete it. Only skills installed on their own go in categories (groups g: and ' +
          'u: in "list"); a skill may be in several. Categories not named stay as they are.',
        additionalProperties: { anyOf: [TEXT_LIST, { type: 'null' }] },
      },
      agents: {
        type: 'object',
        description:
          'save: Agent name to everything it loads from now on, or null to delete it: "groups", group ids taken whole ' +
          '(g:<category>, p:<plugin>, s:<source>), which also bring the skills a group gains later; "skills", single ' +
          'skills by name. Agents not named stay as they are.',
        additionalProperties: {
          anyOf: [
            { type: 'object', properties: { groups: TEXT_LIST, skills: TEXT_LIST }, additionalProperties: false },
            { type: 'null' },
          ],
        },
      },
      rename: {
        type: 'object',
        description: 'save: old name to new, done first. A renamed category stays in the Agents that take it whole.',
        properties: {
          categories: { type: 'object', additionalProperties: { type: 'string' } },
          agents: { type: 'object', additionalProperties: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
    required: ['action'],
  },
}

/** What the model reads with "list": how categories and Agents work, before it plans a "save". */
const LIST_RULES =
  'Categories (g:) are the user\'s own groups of skills installed on their own; "u:" holds those in no category, ' +
  'and a skill may be in several categories. Plugin skills (p:) and Claude\'s own (s:) stay in their groups. An ' +
  'Agent takes whole groups by id, which brings the skills a group gains later too, and single skills by name. ' +
  '"save" replaces each category and Agent it names and leaves the rest as they are; it refuses the whole save ' +
  'if anything is wrong, and the user confirms the exact changes on a card. Tell the user the plan before saving. ' +
  "Agents are shared with the user's other agent platforms (Codex): an Agent's groups and skills that Claude Code " +
  "doesn't have stay in it as they are."

/** The store's key for the libraries a "save" replaced, newest last, for "undo". */
const UNDO_KEY = 'undo'
const MAX_UNDO = 10

/** What one "save" replaced, and what it wrote. */
type UndoStep = { at: number; before: Library; after: Library; renames?: [string, string][] }

// The language the person is spoken to in.

/** The language shown now: the one library.json sets, or for `auto` the one this session came to (English till then). */
async function langNow($: EngineInterface): Promise<Lang> {
  const { language } = await read($, prefs)
  return language === 'auto' ? ((await read($, detected)) ?? 'en') : language
}

async function words($: EngineInterface): Promise<Words> {
  return WORDS[await langNow($)]
}

/** Claude Code's own `language` setting, when it names Chinese or English. */
async function settingLanguage($: EngineInterface): Promise<Lang | undefined> {
  try {
    return languageFromSetting(await $.settings.read({ key: 'language' }))
  } catch {
    return undefined
  }
}

/**
 * Works out what `auto` stands for: Claude Code's language setting; else the language of the
 * person's message (`message`, their first); else what this session or the last one came to.
 */
async function detectLanguage($: EngineInterface, message?: string): Promise<void> {
  const fromSetting = await settingLanguage($)
  const fromMessage = message === undefined ? undefined : languageOf(message)
  let stored: Lang | undefined
  try {
    stored = asLang(await $.store.get(LANGUAGE_KEY))
  } catch {
    stored = undefined
  }
  const found = fromSetting ?? fromMessage ?? (await read($, detected)) ?? stored
  await update($, detected, () => found ?? null)
  // The next session's panel, before its first message, speaks as this one does.
  if (fromSetting === undefined && fromMessage !== undefined && fromMessage !== stored) {
    try {
      await $.store.set(LANGUAGE_KEY, fromMessage)
    } catch {
      // Remembering it is a nicety.
    }
  }
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
  return { library: { groups: defaults.groups, presets: defaults.presets }, prefs: DEFAULT_PREFS, extra: {} }
}

async function setLibrary($: EngineInterface, value: LibraryValue, file: DataFile): Promise<void> {
  await update($, library, () => value.library)
  await update($, prefs, () => value.prefs)
  // What JSON.parse gave back is JSON through and through.
  await update($, extra, () => value.extra as Record<string, JsonValue>)
  await update($, dataFile, () => file)
}

async function keepCopy($: EngineInterface, value: LibraryValue): Promise<void> {
  const copy = JSON.parse(libraryFileText(value.library, value.prefs, value.extra)) as unknown
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
  let problem = 'not a JSON object'
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

/** How many times a JSON file that reads back torn is written again. */
const WRITE_TRIES = 3

/**
 * Writes a JSON file, then reads it back. `$.fs.write` writes in place, so two sessions writing at
 * once (the desktop app starts spare sessions together) can leave it torn, with a run of zero bytes
 * inside: then it is written again, after a short wait that differs between sessions. A file that
 * reads back whole, someone else's write included, is left as it is.
 */
async function writeJson($: EngineInterface, path: string, text: string): Promise<void> {
  for (let attempt = 0; attempt < WRITE_TRIES; attempt += 1) {
    if (attempt > 0) await $.clock.sleep(40 + Math.floor(Math.random() * 160))
    await $.fs.write(path, text)
    try {
      JSON.parse(await $.fs.read(path))
      return
    } catch {
      // Torn, or being written by another session: again.
    }
  }
}

/** Writes the library and settings to library.json, keeping the store's copy in step. */
async function writeLibrary($: EngineInterface): Promise<void> {
  const value = { library: await read($, library), prefs: await read($, prefs), extra: await read($, extra) }
  await keepCopy($, value)
  const file = await read($, dataFile)
  if (file.path === '') return
  try {
    await writeJson($, file.path, libraryFileText(value.library, value.prefs, value.extra))
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
  const t = await words($)
  $.ui.toast(isOn ? t.toast.askOn : t.toast.askOff)
}

async function setSubagentPicker($: EngineInterface, picker: Prefs['subagentPicker']): Promise<void> {
  await freshLibrary($)
  await update($, prefs, old => ({ ...old, subagentPicker: picker }))
  await writeLibrary($)
  const t = await words($)
  $.ui.toast(picker === 'person' ? t.toast.pickerPerson : t.toast.pickerAgent)
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

/** How long a skill list file that still says the same is left unwritten; its lastSeen times need refreshing only now and then. */
const CATALOG_FRESH_MS = 12 * 60 * 60 * 1000

/** Writes the skills Claude Code has to claude-code-skills.json, for other tools to show. */
async function writeCatalogFile($: EngineInterface): Promise<string> {
  const skills = await read($, catalog)
  if (skills.length === 0) return 'nothing known yet'
  const dir = await dataDir($)
  if (dir === null) return 'no home folder'
  const path = joinPath(dir, CATALOG_FILE)
  let old: { updatedAt?: unknown; skills?: unknown } | undefined
  try {
    if (await $.fs.exists(path)) old = JSON.parse(await $.fs.read(path)) as { updatedAt?: unknown; skills?: unknown }
  } catch {
    // Missing, torn or half written: written anew below.
    old = undefined
  }
  const at = await nowOr0($)
  const seen = mergeSeen(old?.skills, skills, at)
  // The skills every set keeps, so that another tool counts a set as the card does.
  const { alwaysOn } = await read($, config)
  // Every session writes this file as it starts, several at once in the desktop app: one that says
  // the same and was written lately is left alone, so most starts write nothing.
  const wasAt = typeof old?.updatedAt === 'string' ? Date.parse(old.updatedAt) : Number.NaN
  if (at - wasAt < CATALOG_FRESH_MS && sameCatalog(old, alwaysOn, seen)) return `${seen.length} skills, unchanged`
  const file = { platform: 'claude-code', updatedAt: new Date(at).toISOString(), alwaysOn, skills: seen }
  await writeJson($, path, `${JSON.stringify(file, null, 2)}\n`)
  return `${seen.length} skills`
}

async function allNames($: EngineInterface): Promise<string[]> {
  return (await read($, catalog)).map(skill => skill.name)
}

async function groupsNow($: EngineInterface, isEmptyShown = false): Promise<Group[]> {
  return groupSkills(await read($, catalog), (await read($, library)).groups, isEmptyShown, await langNow($))
}

async function alwaysNow($: EngineInterface): Promise<string[]> {
  const { alwaysOn } = await read($, config)

  return (await allNames($)).filter(name => matchesAny(alwaysOn, name))
}

async function selectionNow($: EngineInterface): Promise<Selection> {
  const skills = await read($, catalog)
  const lib = await read($, library)

  const lang = await langNow($)

  return describeSelection(
    skills.map(skill => skill.name),
    groupSkills(skills, lib.groups, false, lang),
    lib,
    await read($, allow),
    await read($, active),
    await alwaysNow($),
    lang,
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
  if (ALL_WORDS.includes(name)) return { ...task, allow: null, label: (await words($)).unlimited }
  const preset = (await read($, library)).presets[name]
  if (preset === undefined) return undefined

  return { ...task, allow: resolvePreset(preset, await groupsNow($), await allNames($)), label: name }
}

/** The note on the main conversation's first listing that tells the model how subagents get their skills. */
async function briefing($: EngineInterface): Promise<string> {
  const lib = await read($, library)
  const groups = await groupsNow($, true)
  const lang = await langNow($)
  const choices = Object.entries(lib.presets)
    .filter(([name]) => !RESERVED.includes(name))
    .map(([name, preset]) => ({ name, summary: agentSummary(preset, groups, lang) }))

  const brief = choices.length === 0 ? '' : subagentBrief(choices, (await read($, prefs)).subagentPicker, lang)

  return brief + TOOL_NOTE
}

/** The line the first listing ends with, so that the model knows where the user's sets and categories are changed. */
const TOOL_NOTE =
  "\n\n(To sort the user's skills into categories or change their skill sets (Agents), use the " +
  'mcp__skill-loadout__loadout tool: "list" first, then "save"; the user confirms the changes on a card.)'

// The session's loadout, while it can still be changed.

/** The most folders the card remembers; the one used longest ago goes first. */
const FOLDERS_KEPT = 200

/**
 * The folder this conversation works in, read when it is needed: the desktop app starts a session
 * in a spare or scratch folder and moves it to the person's folder before the first message. In a
 * repository it is the main folder, so its worktrees and subfolders share one memory.
 */
async function folderNow($: EngineInterface): Promise<string> {
  try {
    const repo = await $.session.repo()
    return folderKey(repo?.root ?? (await $.session.root()))
  } catch {
    return folderKey(await read($, cwd))
  }
}

async function remember($: EngineInterface, value: Remembered): Promise<void> {
  const folder = await folderNow($)
  if (folder === '') return
  const byFolder = ((await $.store.get('byFolder')) ?? {}) as Record<string, Remembered>
  const others = Object.entries(byFolder).filter(([key]) => folderKey(key) !== folder)
  await $.store.set('byFolder', Object.fromEntries([...others, [folder, value]].slice(-FOLDERS_KEPT)))
}

/**
 * What this folder's conversations used last, which the card offers first: an
 * Agent's name, 不限制 (in either language, as ALL_WORDS has it), or null.
 */
async function lastPickHere($: EngineInterface): Promise<string | null> {
  const folder = await folderNow($)
  const byFolder = ((await $.store.get('byFolder')) ?? {}) as Record<string, Remembered>
  const found = Object.entries(byFolder)
    .reverse()
    .find(([key]) => folderKey(key) === folder)?.[1]
  if (found === undefined) return null

  return found.preset ?? (found.allow === null ? UNLIMITED : null)
}

/** What recent conversations used, the newest first: Agents by name, and `unlimited` for every skill. */
async function recentUses($: EngineInterface, unlimited: string): Promise<string[]> {
  try {
    return Object.values(await readLocks($))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .flatMap(one => (typeof one.agent === 'string' ? [one.agent] : one.allow === null ? [unlimited] : []))
  } catch {
    return []
  }
}

/** Points the folders' memory and the kept locks at an Agent's new name, so that the card still ranks it. */
async function rememberRename($: EngineInterface, from: string, to: string): Promise<void> {
  try {
    const byFolder = ((await $.store.get('byFolder')) ?? {}) as Record<string, Remembered>
    await $.store.set(
      'byFolder',
      Object.fromEntries(Object.entries(byFolder).map(([key, one]) => [key, one.preset === from ? { ...one, preset: to } : one])),
    )
    const locks = await readLocks($)
    await $.store.set(
      LOCKS_KEY,
      Object.fromEntries(Object.entries(locks).map(([id, one]) => [id, one.agent === from ? { ...one, agent: to } : one])),
    )
  } catch {
    // The card only ranks the renamed Agent as new.
  }
}

/** Sets this session's selection, before its first turn; every skill ticked is "every skill". */
async function choose($: EngineInterface, next: string[] | null, agent: string | null): Promise<void> {
  const held = await read($, lock)
  if (held !== null) {
    $.ui.toast((await words($)).locked(held.label))
    return
  }
  const names = await allNames($)
  const isAll = next !== null && names.length > 0 && names.every(name => next.includes(name))
  const value = isAll ? null : next
  await update($, allow, () => value)
  await update($, active, () => (isAll ? null : agent))
  // A set the client prepared is this session's only while nothing else was chosen after it.
  await update($, prepared, () => null)
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

// The set the tray client prepared for the next session, which the card offers first.

/** The client's prepared set while a card may offer it, with the file as read; null when there is none. */
async function readPrepared($: EngineInterface): Promise<Prepared | null> {
  const dir = await dataDir($)
  if (dir === null) return null
  const path = joinPath(dir, NEXT_FILE)
  try {
    if (!(await $.fs.exists(path))) return null
    const raw: unknown = JSON.parse(await $.fs.read(path))
    const next = readNextSession(raw, await nowOr0($))
    return next === undefined ? null : { next, raw: raw as Record<string, unknown> }
  } catch {
    // Missing, half written or broken: nothing on offer.
    return null
  }
}

/**
 * Whether the tray client is installed here: it writes client.json, naming its
 * program, each time it starts; a program no longer there was uninstalled.
 */
async function hasClient($: EngineInterface): Promise<boolean> {
  const dir = await dataDir($)
  if (dir === null) return false
  try {
    const path = joinPath(dir, CLIENT_FILE)
    if (!(await $.fs.exists(path))) return false
    const info = JSON.parse(await $.fs.read(path)) as { path?: unknown }
    return typeof info.path === 'string' && info.path !== '' && (await $.fs.exists(info.path))
  } catch {
    return false
  }
}

/** Makes the client's prepared set this session's, and marks it taken so that no other card offers it. */
async function applyPrepared($: EngineInterface, found: Prepared): Promise<void> {
  if ((await read($, lock)) !== null) return
  const lib = await read($, library)
  const basedOn = found.next.basedOn !== null && found.next.basedOn in lib.presets ? found.next.basedOn : null
  await choose($, resolvePreset(found.next.preset, await groupsNow($), await allNames($)), basedOn)
  await update($, prepared, () => found.next.preset)
  const dir = await dataDir($)
  if (dir === null) return
  try {
    await writeJson($, joinPath(dir, NEXT_FILE), usedNextSession(found.raw, await sessionIdNow($), await nowOr0($)))
  } catch {
    // The set is this session's either way; another card may offer it again until the file says otherwise.
  }
}

/** The line under the card's option for the prepared set: the Agent it started from and how it differs, its size, its age. */
async function preparedNote($: EngineInterface, next: NextSession): Promise<string> {
  const skills = await read($, catalog)
  const names = skills.map(skill => skill.name)
  const lib = await read($, library)
  const lang = await langNow($)
  const t = WORDS[lang]
  const groups = groupSkills(skills, lib.groups, true, lang)
  const set = resolvePreset(next.preset, groups, names)
  const base = next.basedOn === null ? undefined : lib.presets[next.basedOn]
  const parts: string[] = []
  if (next.basedOn !== null && base !== undefined && names.length > 0) {
    const { added, removed } = setChanges(set, resolvePreset(base, groups, names))
    parts.push(t.card.basedOn(next.basedOn, added, removed))
  } else {
    parts.push(agentSummary(next.preset, groups, lang))
  }
  if (names.length > 0) parts.push(t.card.skills(new Set([...set, ...(await alwaysNow($))]).size))
  parts.push(t.card.preparedAgo(Math.round(((await nowOr0($)) - next.createdAt) / 60_000)))

  return parts.join(' · ')
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
  return plainName(raw)
}

/** Why a name cannot be an Agent's, or undefined when it can. */
function nameProblem(t: Words, name: string): string | undefined {
  if (name === '') return t.toast.nameEmpty
  return RESERVED.includes(name) ? t.toast.nameReserved(name) : undefined
}

/** Saves what the session has on as an Agent: a new one, or over the named one. */
async function saveAgentFromSession($: EngineInterface, raw: string): Promise<void> {
  const t = await words($)
  const name = cleanName(raw)
  const problem = nameProblem(t, name)
  if (problem !== undefined) {
    $.ui.toast(problem)
    return
  }
  const lib = await freshLibrary($)
  const isNew = !(name in lib.presets)
  // Over an Agent that exists, the skills Claude Code doesn't have (Codex's) stay in it.
  const groups = await groupsNow($, true)
  const preset = keepUnseen(toPreset(await current($), groups), lib.presets[name], groups, await allNames($))
  await saveLibrary($, { ...lib, presets: { ...lib.presets, [name]: preset } })
  if ((await read($, lock)) === null) {
    await update($, active, () => name)
    await remember($, { preset: name, allow: await read($, allow) })
  }
  $.ui.toast(isNew ? t.toast.savedAsNew(name) : t.toast.updated(name))
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
  const t = await words($)
  const name = cleanName(edited.name)
  const problem = nameProblem(t, name)
  if (problem !== undefined) {
    $.ui.toast(problem)
    return
  }
  const lib = await freshLibrary($)
  if (name !== edited.original && name in lib.presets) {
    $.ui.toast(t.toast.nameTaken(name))
    return
  }
  // The skills Claude Code doesn't have (Codex's) stay in the Agent as they were.
  const groups = await groupsNow($, true)
  const original = edited.original === null ? undefined : lib.presets[edited.original]
  const preset = keepUnseen(toPreset(edited.selected, groups), original, groups, await allNames($))
  const entries = Object.entries(lib.presets).map(([key, value]) =>
    key === edited.original ? ([name, preset] as const) : ([key, value] as const),
  )
  const isNew = edited.original === null || !(edited.original in lib.presets)
  await saveLibrary($, { ...lib, presets: Object.fromEntries(isNew ? [...entries, [name, preset]] : entries) })
  if (!isNew && edited.original !== null && edited.original !== name) await rememberRename($, edited.original, name)
  if (!isNew && (await read($, active)) === edited.original) await update($, active, () => name)
  $.ui.toast(isNew ? t.toast.created(name) : t.toast.saved(name))
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
    $.ui.toast((await words($)).toast.groupTaken(label))
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

/** Puts a loose skill into the group, or takes it out when it is in; the other groups keep it as they have it. */
async function toggleGroupMember($: EngineInterface, label: string, name: string): Promise<void> {
  const lib = await freshLibrary($)
  const group = (await groupsNow($, true)).find(one => one.id === `g:${label}`)
  const isMember = group?.names.includes(name) ?? false
  await saveLibrary($, { ...lib, groups: setMember(lib.groups, label, name, !isMember) })
}

async function renameGroupTo($: EngineInterface, from: string, raw: string): Promise<void> {
  const to = cleanName(raw)
  const lib = await freshLibrary($)
  if (to === '' || to === from) return
  const t = await words($)
  if (to in lib.groups) {
    $.ui.toast(t.toast.groupTaken(to))
    return
  }
  await saveLibrary($, renameGroup(lib, from, to))
  await update($, expanded, old => old.map(id => id.replace(`:g:${from}`, `:g:${to}`)))
  await update($, editGroup, () => to)
  $.ui.toast(t.toast.renamed(to))
}

async function removeGroup($: EngineInterface, label: string): Promise<void> {
  const lib = await freshLibrary($)
  const group = (await groupsNow($, true)).find(one => one.id === `g:${label}`)
  await saveLibrary($, deleteGroup(lib, label, group?.names ?? []))
  $.ui.toast((await words($)).toast.groupDeleted(label))
  await go($, 'manage')
}

// The loadout tool's changes: Claude sorts the person's skills when they ask it to, in place of the panel or the client.

/** The skills with what each does: the listing's words, or for one it has not described, claude-code-skills.json's. */
async function describedCatalog($: EngineInterface): Promise<SkillEntry[]> {
  const skills = await read($, catalog)
  if (skills.every(skill => skill.description !== undefined)) return skills
  const dir = await dataDir($)
  let seen: Map<string, string>
  try {
    const file = dir === null ? undefined : (JSON.parse(await $.fs.read(joinPath(dir, CATALOG_FILE))) as { skills?: unknown })
    const listed = Array.isArray(file?.skills) ? (file.skills as SkillEntry[]) : []
    seen = new Map(listed.flatMap(one => (typeof one.description === 'string' ? [[one.name, one.description] as const] : [])))
  } catch {
    return skills
  }

  return skills.map(skill => (skill.description !== undefined || !seen.has(skill.name) ? skill : { ...skill, description: seen.get(skill.name) }))
}

/** The tool's answer to the model: text it reads as the result. */
function toolText(text: string): { result: string; text: string } {
  return { result: text, text }
}

/** Why library.json can't take a change now, or undefined when it can: a file the person broke stays as they wrote it. */
function fileTrouble(file: DataFile): string | undefined {
  if (file.status === 'ok') return undefined
  const where = file.path === '' ? 'no home folder is known' : file.path

  return `library.json can't be changed now (${file.status}${file.error === undefined ? '' : `: ${file.error}`}; ${where}). Nothing was saved.`
}

async function readUndo($: EngineInterface): Promise<UndoStep[]> {
  try {
    const kept = await $.store.get(UNDO_KEY)
    return Array.isArray(kept) ? (kept as UndoStep[]) : []
  } catch {
    return []
  }
}

/** How many changes the confirmation card lists before it says how many more there are. */
const CHANGES_SHOWN = 8

type Confirmed = { isYes: boolean; isAnswered: boolean; typed: string }

/**
 * The option a confirmation card's answer names, read strictly: the label as it
 * is, quoted, or followed by its description. Words typed under Other are no
 * pick, so that 「不要保存」 never reads as 保存.
 */
function confirmPick(answer: string, labels: readonly string[]): string | null {
  const quoted = [...answer.matchAll(/["“「『]([^"”」』]+)["”」』]/g)].map(match => (match[1] ?? '').trim())

  return (
    labels.find(
      label =>
        answer === label || quoted[quoted.length - 1] === label || answer.startsWith(`${label} - `) || answer.startsWith(`${label} — `),
    ) ?? null
  )
}

/** Asks on a card of this plugin's, two options with a line under each; an answer typed under Other comes back as `typed`. */
async function confirmOnCard(
  $: EngineInterface,
  question: string,
  yes: readonly [label: string, note: string],
  no: readonly [label: string, note: string],
): Promise<Confirmed> {
  const t = await words($)
  cardNotes.set(question, { notes: { [yes[0]]: yes[1], [no[0]]: no[1] }, isMain: false, isPlain: true })
  try {
    const answer = (await $.ui.ask(question, { header: t.cardHeader, options: [yes[0], no[0]] })).trim()
    const picked = confirmPick(answer, [yes[0], no[0]])
    return { isYes: picked === yes[0], isAnswered: true, typed: picked === null ? answer.slice(0, 300) : '' }
  } catch {
    // Closed, or nobody to ask.
    return { isYes: false, isAnswered: false, typed: '' }
  } finally {
    cardNotes.delete(question)
  }
}

/** What the model reads when the person did not say yes on the card. */
function notConfirmed(answer: Confirmed, what: string): { deny: string } {
  if (!answer.isAnswered) return { deny: `Nothing was ${what}: the confirmation card was closed, or nobody could be asked.` }
  const said = answer.typed === '' ? '' : ` and wrote: "${answer.typed}"`

  return { deny: `Nothing was ${what}: the user said no on the confirmation card${said}.` }
}

/**
 * The tool's "save": checks every change, shows them on a card, and once the
 * person says yes writes them together, keeping what they replaced for "undo".
 */
async function saveFromTool($: EngineInterface, input: Record<string, unknown>): Promise<{ result: string; text: string } | { deny: string }> {
  const first = await freshLibrary($)
  const trouble = fileTrouble(await read($, dataFile))
  if (trouble !== undefined) return { deny: trouble }
  const checked = applyChanges(first, input, await read($, catalog), await alwaysNow($))
  if (checked.problems.length > 0) return { deny: `Nothing was saved:\n- ${checked.problems.join('\n- ')}` }
  if (checked.changes.length === 0) return toolText('Nothing to change: the categories and Agents named are already like that.')
  const t = await words($)
  const lines = checked.changes.map(change => t.confirm.change(change))
  const answer = await confirmOnCard(
    $,
    t.confirm.question(lines.slice(0, CHANGES_SHOWN), Math.max(0, lines.length - CHANGES_SHOWN)),
    [t.confirm.save, t.confirm.saveNote],
    [t.confirm.cancel, t.confirm.cancelNote],
  )
  if (!answer.isYes) return notConfirmed(answer, 'saved')
  // The file as it is now: the panel or the client may have changed it while the card waited.
  const before = await freshLibrary($)
  const outcome =
    JSON.stringify(before) === JSON.stringify(first) ? checked : applyChanges(before, input, await read($, catalog), await alwaysNow($))
  if (outcome.problems.length > 0) {
    return { deny: `Nothing was saved: library.json changed while the card was open, and now:\n- ${outcome.problems.join('\n- ')}` }
  }
  await saveLibrary($, outcome.library)
  const written = await read($, dataFile)
  if (written.status !== 'ok') return { deny: `library.json could not be written (${written.error ?? written.status}). Nothing was saved.` }
  const steps = await readUndo($)
  const renames = outcome.changes.flatMap(change => (change.kind === 'agentRenamed' ? [[change.from, change.to] as [string, string]] : []))
  const step: UndoStep = { at: await nowOr0($), before, after: outcome.library, renames }
  await $.store.set(UNDO_KEY, [...steps, step].slice(-MAX_UNDO))
  for (const [from, to] of renames) {
    await rememberRename($, from, to)
    if ((await read($, active)) === from) await update($, active, () => to)
  }

  return toolText(
    `Saved to ${written.path}:\n- ${outcome.changes.map(changeForModel).join('\n- ')}\n` +
      "New conversations' cards offer these; this conversation keeps the skills it started with. " +
      '"undo" puts back what this save changed.',
  )
}

/** The tool's "undo": puts library.json's categories and Agents back as they were before the last save. */
async function undoFromTool($: EngineInterface): Promise<{ result: string; text: string } | { deny: string }> {
  const steps = await readUndo($)
  const last = steps[steps.length - 1]
  if (last === undefined) return toolText('Nothing to undo: no save made with this tool is kept.')
  const now = await freshLibrary($)
  const trouble = fileTrouble(await read($, dataFile))
  if (trouble !== undefined) return { deny: trouble }
  const minutes = Math.max(0, Math.round(((await nowOr0($)) - last.at) / 60_000))
  const isChangedSince = JSON.stringify(now) !== JSON.stringify(last.after)
  const t = await words($)
  const answer = await confirmOnCard($, t.confirm.undoQuestion(minutes, isChangedSince), [t.confirm.undo, t.confirm.undoNote], [
    t.confirm.keep,
    t.confirm.keepNote,
  ])
  if (!answer.isYes) return notConfirmed(answer, 'undone')
  await saveLibrary($, last.before)
  const written = await read($, dataFile)
  if (written.status !== 'ok') return { deny: `library.json could not be written (${written.error ?? written.status}). Nothing was undone.` }
  await $.store.set(UNDO_KEY, steps.slice(0, -1))
  for (const [from, to] of [...(last.renames ?? [])].reverse()) await rememberRename($, to, from)

  return toolText(
    `Undone: the categories and Agents are back as they were before the save of ${minutes} min ago.` +
      (isChangedSince ? ' Changes made after that save, in the panel or the client, are undone with it.' : '') +
      (steps.length > 1 ? ` ${steps.length - 1} earlier save(s) can still be undone.` : ''),
  )
}

async function resetLibrary($: EngineInterface): Promise<void> {
  const defaults = await read($, config)
  await freshLibrary($)
  await saveLibrary($, { groups: defaults.groups, presets: defaults.presets })
  $.ui.toast((await words($)).toast.reset)
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
  const lang = await langNow($)
  const t = WORDS[lang]
  const groups = groupSkills(skills, lib.groups, true, lang)
  const always = await alwaysNow($)
  const last = isFirstMessage ? await lastPickHere($) : null
  const isLastAll = last !== null && ALL_WORDS.includes(last)
  const line = (...parts: (string | undefined)[]): string => parts.filter(part => part !== undefined && part !== '').join(' · ')

  return label => {
    const note = notes[label]
    if (ALL_WORDS.includes(label)) {
      return line(isLastAll ? t.card.lastHere : note, names.length > 0 ? t.card.allSkills(names.length) : t.card.allSkillsUnknown)
    }
    if (MORE_LABELS.includes(label)) return note ?? ''
    const preset = lib.presets[label]
    if (preset === undefined) return note ?? ''
    const count = new Set([...resolvePreset(preset, groups, names), ...always]).size
    return line(
      label === last ? t.card.lastHere : note,
      agentSummary(preset, groups, lang),
      names.length > 0 ? t.card.skills(count) : undefined,
    )
  }
}

/** What a card came to: the option picked (null for none), and the answers as the host gave them. */
type CardResult = { picked: string | null; answers: string[]; outcome: string }

/**
 * Shows the card until an option is picked: 「更多 Agent…」 pages through the
 * pool, saying what the next page holds, and an answer that names none asks
 * again, a few times at most. Each
 * round reads what it offers anew (`round`), so that an Agent or a set made in
 * the tray client while the card waits shows on the next one.
 */
async function askCard($: EngineInterface, round: () => Promise<CardRound>): Promise<CardResult> {
  const answers: string[] = []
  let start = 0
  let misses = 0
  let lead = ''
  for (let turn = 0; turn < MAX_ROUNDS && misses < MAX_MISSES; turn += 1) {
    const now = await round()
    const t = await words($)
    const page = askPage(now.pool, start, t.more)
    const asked = (lead === '' ? (now.hint ?? '') : lead) + now.question
    const following = askPage(now.pool, page.next, t.more).options.filter(option => option !== t.more)
    const notes = page.options.includes(t.more) ? { ...now.notes, [t.more]: t.card.nextPage(following, page.next === 0) } : now.notes
    cardNotes.set(asked, { notes, isMain: now.isMain })
    let answer: string
    try {
      answer = await $.ui.ask(asked, { header: t.cardHeader, options: page.options })
    } catch {
      // Dismissed, or nobody to ask (a -p run).
      return { picked: null, answers, outcome: 'dismissed' }
    } finally {
      cardNotes.delete(asked)
    }
    answers.push(answer.slice(0, 300))
    const picked = pickOption(answer, page.options, now.agents)
    if (picked !== null && MORE_LABELS.includes(picked)) {
      start = page.next
      lead = ''
      continue
    }
    if (picked !== null) return { picked, answers, outcome: `picked ${picked}` }
    if (answer.trim() === '') return { picked: null, answers, outcome: 'empty answer' }
    misses += 1
    lead = isClientWord(answer) ? t.card.noClientSet : t.card.notAnAgent(cleanName(answer))
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
  if (offeredAgents(lib).length === 0 && (await readPrepared($)) === null) {
    return { picked: null, answers: [], outcome: 'no agents' }
  }
  await update($, asking, () => true)
  try {
    const last = await lastPickHere($)
    const card = await askCard($, async () => {
      const agents = offeredAgents(await freshLibrary($))
      const t = await words($)
      // What the folder used last first, then what recent conversations used most; 不限制 is one of them.
      const lastHere = last !== null && ALL_WORDS.includes(last) ? t.unlimited : last
      const ordered = rankChoices([...agents, t.unlimited], await recentUses($, t.unlimited), lastHere)
      const found = await readPrepared($)
      if (found === null) {
        const hint = (await hasClient($)) ? t.card.clientHint : ''
        return { question: t.ask, hint, pool: ordered, agents, notes: {}, isMain: true }
      }
      const notes = { [t.clientPick]: await preparedNote($, found.next) }
      return { question: t.ask, pool: [t.clientPick, ...ordered], agents, notes, isMain: true }
    })
    let isSet = false
    if (card.picked !== null && CLIENT_LABELS.includes(card.picked)) {
      // The set as the client holds it now: it may have changed while the card waited.
      const found = await readPrepared($)
      if (found !== null) {
        await applyPrepared($, found)
        isSet = true
      }
    } else if (card.picked !== null) {
      isSet = await applyAgent($, card.picked)
    }
    const t = await words($)
    const selection = await selectionNow($)
    if (isSet) {
      $.ui.toast(t.card.chose(selection.label, (await allNames($)).length > 0 ? selection.loaded.size : null))
    } else {
      // The conversation starts with what it has.
      $.ui.toast(t.card.noneChosen(selection.label))
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
  const t = await words($)
  const same = isUnderMain ? t.sameAsMain : t.sameAsParent
  // The suggestion as the card names it: an Agent, or 不限制 in the card's language.
  const named = suggested !== null && ALL_WORDS.includes(suggested) ? t.unlimited : suggested
  const first = named !== null && (agents.includes(named) || named === t.unlimited) ? named : null
  const rest = rankChoices([...agents, t.unlimited].filter(name => name !== first), await recentUses($, t.unlimited), null)
  const pool = [same, ...(first === null ? [] : [first]), ...rest]
  const question = t.card.subQuestion(task.description === '' ? t.card.newTask : task.description)
  const notes = {
    [same]: t.card.keeps(parent.label),
    ...(first === null ? {} : { [first]: t.card.suggested }),
  }
  const card = await askCard($, async () => ({ question, pool, agents, notes, isMain: false }))
  const kept: SubLoadout = { ...task, allow: parent.allow, label: parent.label, by: 'inherit' }
  if (card.picked === null || card.picked === same) return kept

  return (await namedLoadout($, card.picked, { ...task, by: 'person' })) ?? kept
}

// The panel: opened on its own when a new session starts, unless the card asks instead;
// after the person closes it, only they reopen it.

async function openPane($: EngineInterface): Promise<{ isPlaced: boolean; reason?: string }> {
  await freshLibrary($)
  const opened = await $.ui.open({ id: PANE, title: (await words($)).title })
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
    await step('config', async () => {
      const loaded = await loadConfig($)
      await update($, config, () => loaded)
      return loaded.alwaysOn.length
    })
    await step('file', () => loadLibrary($))
    // The language the session speaks till its first message says more: the command's description is in it.
    await step('language', async () => {
      await detectLanguage($)
      return langNow($)
    })
    await step('command', async () => {
      const t = await words($)
      return $.command.register({ name: 'loadout', description: t.command.description, argumentHint: t.command.hint })
    })
    await step('tool', () => $.tool.register(LOADOUT_TOOL))
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
        await update($, prepared, () => null)
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The tool, answered here: a save or an undo writes only once the person confirms it on a card.
  on('tool.call', { tool: 'mcp__skill-loadout__loadout' }, async ($, e) => {
    const input = e as Record<string, unknown> & { action?: string }
    if (input.action === 'save') return saveFromTool($, input)
    if (input.action === 'undo') return undoFromTool($)
    if (input.action === 'list') {
      const lib = await freshLibrary($)
      const report = libraryReport(lib, await describedCatalog($), await alwaysNow($), await langNow($))
      const file = await read($, dataFile)
      // Compact: about 6k tokens for a hundred skills.
      const text = JSON.stringify({ file: file.path, howItWorks: LIST_RULES, ...report })
      return { result: text, text }
    }
    if (input.action === 'open') {
      const opened = await openPane($)
      // The model reads this, and tells the person in their own words.
      const text = opened.isPlaced
        ? 'The Lodestar panel is open.'
        : `The panel could not be opened (${opened.reason ?? 'the app did not place it'}). The person can press ` +
          '"Open panel" on the Lodestar bar above the prompt, or type /loadout.'
      return { result: text, text }
    }
    const lib = await freshLibrary($)
    const skills = await read($, catalog)
    const names = skills.map(skill => skill.name)
    const lang = await langNow($)
    const groups = groupSkills(skills, lib.groups, true, lang)
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
      language: { setting: (await read($, prefs)).language, shown: lang },
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
    const t = await words($)
    if (typed === '') {
      await openPane($)
      return { text: t.command.opened }
    }
    const held = await read($, lock)
    if (held !== null) return { text: t.locked(held.label) }
    const agents = offeredAgents(await freshLibrary($))
    const lang = await langNow($)
    // The name as typed; else one the text starts with, as when more words follow it.
    const first = typed.split('\n')[0]?.trim() ?? ''
    // The set the tray client prepared, unless an Agent goes by that very word.
    if (isClientWord(first) && !agents.some(name => name.toLowerCase() === first.toLowerCase())) {
      const found = await readPrepared($)
      if (found === null) return { text: t.command.noClientSet }
      await applyPrepared($, found)
      return { text: t.command.usingClient((await selectionNow($)).label) }
    }
    const name =
      answerAgent(typed, agents, lang) ??
      answerAgent(first, agents, lang) ??
      [...agents, ...ALL_WORDS].filter(one => first.toLowerCase().startsWith(one.toLowerCase())).sort((a, b) => b.length - a.length)[0] ??
      null
    if (name !== null && (await applyAgent($, name))) {
      return { text: t.command.using(ALL_WORDS.includes(name) ? t.unlimited : name) }
    }

    return { text: t.command.noAgent(first, [t.unlimited, ...agents]) }
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
        // The card speaks the language the person's first message is in, unless a setting says otherwise.
        await detectLanguage($, e.text)
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
      const fromLine = named === null ? null : pickOption(named, [...agents, (await words($)).unlimited], agents)
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
    if (first === undefined || !CARD_HEADERS.includes(first.header)) return next(e)
    const card = [...cardNotes.entries()].find(([question]) => first.question.endsWith(question))?.[1]
    if (card?.isPlain === true) {
      const options = first.options.map(option => {
        const description = card.notes[option.label]
        return description === undefined ? option : { ...option, description }
      })
      return next({ ...e, questions: [{ ...first, options }, ...rest] })
    }
    const isMain = card?.isMain ?? ASK_QUESTIONS.some(question => first.question.endsWith(question))
    const describe = await describer($, card?.notes ?? {}, isMain)
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
    const t = await words($)
    const total = (await read($, catalog)).length
    const held = await read($, lock)
    const selection = await selectionNow($)
    const isAsked = (await read($, prefs)).askOnNewSession && !(await read($, chosen))
    const state =
      held !== null ? t.band.locked : (await read($, asking)) ? t.band.asking : isAsked ? t.band.willAsk : t.band.canChange

    return (
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor>{t.title}</Text>
          <Text weight="semibold">{held?.label ?? selection.label}</Text>
          <Text dimColor tabular>{`${selection.loaded.size}/${total}`}</Text>
          <Text dimColor>{state}</Text>
        </Box>
        <Button key="band:open" label={t.band.open} onPress={() => openPane($)} />
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // The heart of it: the listing the model reads keeps only the skills this session loads.
  on('prompt.attachment', { type: 'skill_listing' }, async ($, e, next) => {
    const result = await next(e)
    if (result.text === null) return result
    const known = await allNames($)
    const found = listingNames(result.text, known).filter(name => !known.includes(name))
    const names = [...known, ...found]
    // What each skill is for, for other tools to show: kept when it changes.
    const before = new Map((await read($, catalog)).map(skill => [skill.name, skill.description]))
    const described = Object.entries(listingDescriptions(result.text, names)).filter(
      ([name, description]) => before.get(name) !== description,
    )
    await addToCatalog($, [
      ...found.map(name => ({ name })),
      ...described.map(([name, description]) => ({ name, description })),
    ])
    if (found.length > 0 || described.length > 0) {
      try {
        await writeCatalogFile($)
      } catch {
        // The file is a courtesy to other tools; the listing goes on without it.
      }
    }
    const { alwaysOn } = await read($, config)
    // A subagent's listing keeps the skills its spawn settled.
    if (e.agentId !== undefined) return { text: limitListing(result.text, await loadoutOf($, e.agentId), names, alwaysOn, true) }
    let list = await read($, allow)
    // A set chosen before the skills were known (the client's, or an Agent) is worked out again now that they are.
    const agent = await read($, active)
    const preset = (await read($, prepared)) ?? (agent === null ? undefined : (await read($, library)).presets[agent])
    if (known.length === 0 && found.length > 0 && list !== null && preset !== undefined) {
      const resolved = resolvePreset(preset, await groupsNow($), await allNames($))
      list = resolved
      await update($, allow, () => resolved)
      const held = await read($, lock)
      if (held !== null) await saveLock($, held)
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
    // The model reads these, whatever language the person uses.
    if (e.agentId !== undefined) {
      return {
        deny:
          `"${e.skill}" is not in this subagent's skill set ("${held.label}"). Use only the skills you were given; ` +
          'if you really need this one, say in your result which skill you need.',
      }
    }

    return {
      deny:
        `"${e.skill}" is not loaded in this session, and the session's skill set is locked. Don't retry under another name; ` +
        'if it is really needed, tell the user that writing the skill\'s name in a message makes it available for that request.',
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
    const lang = await langNow($)
    const t = WORDS[lang]
    const p = t.pane
    const groups = groupSkills(skills, lib.groups, false, lang)
    const groupsAll = groupSkills(skills, lib.groups, true, lang)
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
                      <Text dimColor>{`☑  ${name}  ${p.alwaysOn}`}</Text>
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
                      {`${selected.has(name) ? '☑' : '☐'}  ${name}${always.has(name) ? `  ${p.alwaysOn}` : ''}`}
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
            {screenHeader('agent-cancel', p.back, 'manage', p.agentHeading)}
            <Text dimColor>{p.noDraft}</Text>
          </Box>
        )
      }
      const shown = new Set([...edited.selected, ...always])

      return (
        <Box flexDirection="column" rowGap="lg">
          {screenHeader('agent-cancel', p.cancel, 'manage', edited.original === null ? p.newAgent : p.editAgent)}
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.name)}
            <Input
              key={`agent-name:${edited.original ?? ''}`}
              value={edited.name}
              placeholder={p.namePlaceholder}
              onInput={value => setDraftName($, value)}
              onSubmit={() => saveDraft($)}
            />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.whichGroups, p.whichGroupsHint)}
            {checklist('a', shown, (group, isOn) => draftSetGroup($, group, isOn), name => draftToggleSkill($, name))}
          </Box>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
            <Text dimColor>{p.picked(names.filter(name => shown.has(name)).length, always.size)}</Text>
            <Button key="agent-save" variant="primary" label={p.save} onPress={() => saveDraft($)} />
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
            {screenHeader('group-done', p.back, 'manage', p.groupsHeading)}
            <Text dimColor>{p.groupGone}</Text>
          </Box>
        )
      }
      const loose = skills.filter(isLoose).map(skill => skill.name)
      // The person's other groups each loose skill is in; a skill may be in several.
      const elsewhere = (name: string): string[] =>
        groupsAll.filter(one => one.kind === 'custom' && one.label !== label && one.names.includes(name)).map(one => one.label)
      const rank = (name: string): number => (group.names.includes(name) ? 0 : elsewhere(name).length > 0 ? 2 : 1)
      const ordered = [...loose].sort((a, b) => rank(a) - rank(b))
      const deleteKey = `group:${label}`
      const isPending = pending === deleteKey

      return (
        <Box flexDirection="column" rowGap="lg">
          {screenHeader('group-done', p.done, 'manage', p.editGroup)}
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.name, p.nameHint)}
            <Input key={`group-name:${label}`} value={label} onSubmit={value => renameGroupTo($, label, value)} />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.members(group.names.length), p.membersHint)}
            {loose.length === 0 && <Text dimColor>{p.noLoose}</Text>}
            {ordered.map(name => {
              const isMember = group.names.includes(name)
              const others = elsewhere(name).join(t.summary.sep)

              return (
                <Button key={`member:${name}`} plain dimColor={!isMember} onPress={() => toggleGroupMember($, label, name)}>
                  {isMember ? '☑  ' : '☐  '}
                  {name}
                  <Text dimColor>{others === '' ? '' : isMember ? p.alsoIn(others) : p.inGroup(others)}</Text>
                </Button>
              )
            })}
          </Box>
          <Button
            key="group-delete"
            plain
            dimColor={!isPending}
            label={isPending ? p.deleteGroupConfirm : p.deleteGroup}
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
      const error = file.error ?? p.unknownError
      const fileProblem =
        file.status === 'invalid'
          ? p.fileInvalid(error)
          : file.status === 'unreadable'
            ? p.fileUnreadable(error)
            : file.status === 'unwritable'
              ? p.fileUnwritable(error)
              : undefined

      return (
        <Box flexDirection="column" rowGap="lg">
          <Box flexDirection="column" rowGap="xs">
            {screenHeader('back', p.back, 'main', p.manage)}
            <Text size="caption" dimColor>
              {p.askClaude}
            </Text>
            {held !== null && (
              <Text size="caption" dimColor>
                {p.lockedNote}
              </Text>
            )}
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.agents, p.agentsHint)}
            {agentNames.length === 0 && <Text dimColor>{p.noAgents}</Text>}
            {agentNames.map(name => {
              const preset = lib.presets[name] ?? { groups: [], skills: [] }
              const isPending = pending === `agent:${name}`

              return (
                <Box flexDirection="column">
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                    <Text weight="semibold">{name}</Text>
                    <Box flexDirection="row" columnGap={1}>
                      <Button key={`edit-agent:${name}`} plain label={p.edit} onPress={() => openAgentEditor($, name)} />
                      <Button
                        key={`del-agent:${name}`}
                        plain
                        dimColor={!isPending}
                        label={isPending ? p.removeConfirm : p.remove}
                        onPress={() => confirmThen($, `agent:${name}`, () => removeAgent($, name))}
                      />
                    </Box>
                  </Box>
                  <Text size="caption" dimColor>
                    {agentSummary(preset, groupsAll, lang)}
                  </Text>
                </Box>
              )
            })}
            <Button key="new-agent" label={p.createAgent} onPress={() => openAgentEditor($, null)} />
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.groups, p.groupsHint)}
            {custom.map(group => {
              const isPending = pending === `group:${group.label}`

              return (
                <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                  <Box flexDirection="row" columnGap={1}>
                    <Text>{group.label}</Text>
                    <Text dimColor tabular>
                      {group.names.length === 0 ? p.emptyGroup : String(group.names.length)}
                    </Text>
                  </Box>
                  <Box flexDirection="row" columnGap={1}>
                    <Button key={`edit-group:${group.label}`} plain label={p.edit} onPress={() => openGroupEditor($, group.label)} />
                    <Button
                      key={`del-group:${group.label}`}
                      plain
                      dimColor={!isPending}
                      label={isPending ? p.removeConfirm : p.remove}
                      onPress={() => confirmThen($, `group:${group.label}`, () => removeGroup($, group.label))}
                    />
                  </Box>
                </Box>
              )
            })}
            <Input key="new-group" placeholder={p.newGroupPlaceholder} onSubmit={value => createGroup($, value)} />
            <Text size="caption" dimColor>
              {ungrouped === undefined ? p.allGrouped : p.looseLeft(ungrouped.names.length)}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.fixedGroups, p.fixedGroupsHint)}
            {fixed.length === 0 && <Text dimColor>{p.none}</Text>}
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
            {sectionTitle(p.newSessions, p.newSessionsHint)}
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text>{p.askFirst}</Text>
              <Button
                key="ask-toggle"
                variant={settings.askOnNewSession ? 'primary' : 'secondary'}
                label={settings.askOnNewSession ? p.on : p.off}
                onPress={() => setAsk($, !settings.askOnNewSession)}
              />
            </Box>
            {!settings.askOnNewSession && (
              <Text size="caption" dimColor>
                {p.askOffNote}
              </Text>
            )}
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.subagents, p.subagentsHint)}
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
              <Text>{p.whoPicks}</Text>
              <Button
                key="subagent-picker"
                variant={settings.subagentPicker === 'person' ? 'primary' : 'secondary'}
                label={settings.subagentPicker === 'person' ? p.pickerPerson : p.pickerAgent}
                onPress={() => setSubagentPicker($, settings.subagentPicker === 'person' ? 'agent' : 'person')}
              />
            </Box>
            <Text size="caption" dimColor>
              {settings.subagentPicker === 'person' ? p.pickerPersonNote : p.pickerAgentNote}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.dataFile, p.dataFileHint)}
            <Text size="caption">{file.path === '' ? p.noHome : file.path}</Text>
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
            label={pending === 'reset' ? p.resetConfirm : p.reset}
            onPress={() => confirmThen($, 'reset', () => resetLibrary($))}
          />
        </Box>
      )
    }

    // The main screen.
    const selection = describeSelection(names, groups, lib, list, await read($, active), [...always], lang)
    const tokensOf = new Map(skills.map(skill => [skill.name, skill.tokens ?? 0]))
    const tokensIn = (members: readonly string[]): number =>
      members.reduce((sum, name) => sum + (tokensOf.get(name) ?? 0), 0)
    const totalTokens = tokensIn(names)
    const loadedTokens = tokensIn(names.filter(name => selection.loaded.has(name)))
    const tokenText = totalTokens > 0 ? p.listTokens(formatTokens(loadedTokens), formatTokens(totalTokens)) : ''
    const loadedLine = p.loaded(selection.loaded.size, names.length, tokenText)
    const manageButton = <Button key="manage" label={p.manage} onPress={() => go($, 'manage')} />

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
            <Text color="success">{p.lockedState}</Text>
            <Text size="caption" dimColor>
              {loadedLine}
            </Text>
          </Box>
          <Box flexDirection="column" rowGap="xs">
            {sectionTitle(p.loadedHeading, p.loadedHint)}
            {readonlyList(selection.loaded)}
            {always.size > 0 && (
              <Text size="caption" dimColor>
                {p.alwaysCount(always.size)}
              </Text>
            )}
          </Box>
          {subs.length > 0 && (
            <Box flexDirection="column" rowGap="xs">
              {sectionTitle(p.subagentsHeading, p.subagentsHeadingHint)}
              {subs
                .slice(-6)
                .reverse()
                .map(one => (
                  <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
                    <Text>{one.description === '' ? p.subagent : one.description}</Text>
                    <Text dimColor>{`${one.label} · ${t.settledBy[one.by]}`}</Text>
                  </Box>
                ))}
            </Box>
          )}
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX="md" paddingY="sm" rowGap="sm">
            {example !== undefined && (
              <Box flexDirection="column">
                <Text>{p.useLeftOut}</Text>
                <Text size="caption" dimColor>
                  {p.useLeftOutHint(example)}
                </Text>
              </Box>
            )}
            <Box flexDirection="column">
              <Text>{p.otherSet}</Text>
              <Text size="caption" dimColor>
                {settings.askOnNewSession ? p.otherSetAsk : p.otherSetPanel}
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
                {t.title}
              </Text>
              {manageButton}
            </Box>
            <Text color="warning">{p.askingState}</Text>
            <Text size="caption" dimColor>
              {p.askingHint}
            </Text>
          </Box>
        </Box>
      )
    }

    // Before the first message: pick an Agent, then adjust its groups for this session.
    const basedOn = selection.basedOn
    const isModified = !selection.isAll && selection.matched === null
    const status = names.length === 0 ? { text: p.noSkillsYet, color: 'subtle' } : { text: p.canChange, color: 'warning' }
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
              {p.cardWillAsk}
            </Text>
          )}
        </Box>
        <Box flexDirection="column" rowGap="xs">
          {sectionTitle(p.whichAgent)}
          {agentNames.map(name => {
            const preset = lib.presets[name] ?? { groups: [], skills: [] }
            const size = new Set([...resolvePreset(preset, groups, names), ...always]).size
            return radio(`agent:${name}`, name, selection.matched === name, String(size), () => applyAgent($, name))
          })}
          {radio('agent:__all', t.unlimited, selection.isAll, p.everySkill(names.length), () => applyAgent($, t.unlimited))}
          {agentNames.length === 0 && (
            <Text size="caption" dimColor>
              {p.noAgentsYet}
            </Text>
          )}
        </Box>
        {isModified && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX="md" paddingY="sm" rowGap="xs">
            <Text>{basedOn !== null ? p.editedFrom(basedOn) : p.matchesNone}</Text>
            <Text size="caption" dimColor>
              {basedOn !== null ? p.keepEditedHint : p.keepHint}
            </Text>
            {basedOn !== null && (
              <Button key="update-agent" label={p.saveInto(basedOn)} onPress={() => saveAgentFromSession($, basedOn)} />
            )}
            <Input key="save-agent" placeholder={p.saveAsPlaceholder} onSubmit={value => saveAgentFromSession($, value)} />
          </Box>
        )}
        <Box flexDirection="column" rowGap="xs">
          {sectionTitle(p.groupsLoaded, p.groupsLoadedHint)}
          {checklist('m', selection.loaded, (group, isOn) => setGroup($, group, isOn), name => toggleSkill($, name))}
          {always.size > 0 && (
            <Text size="caption" dimColor>
              {p.alwaysCount(always.size)}
            </Text>
          )}
        </Box>
      </Box>
    )
  })
}
