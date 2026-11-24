// The client's state: the data folder's files as last read, kept fresh as the
// plugin (or a person) changes them, and the changes the pages make.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  copyAgents as copyInto,
  categoryCopies,
  deleteGroup as dropGroup,
  groupSkills,
  libraryFileText,
  renameGroup as renameIn,
  setMember,
} from '@shared/listing'
import type { Library, Preset, Prefs, SkillEntry } from '../../../plugin/types'
import { backend, type Backend } from './backend'
import { CODEX_ALWAYS_ON, codexCatalogText, codexSwitchOff, sameSwitchOff, type CodexInfo } from './codex'
import {
  DEFAULTS,
  FILES,
  defaultLibrary,
  nextFileText,
  parseCatalog,
  parseCodexOff,
  parseCodexRecord,
  parseLibrary,
  libraryOf,
  movedCodexLibrary,
  parseNext,
  withLibrary,
  type Catalog,
  type CodexRecord,
  type FileName,
  type LibraryStatus,
  type LibraryValue,
  type NextState,
  type Platform,
} from './files'

/** Codex, when it is installed: its skills as last read, and the Agent new Codex sessions use. */
export type CodexState = {
  /** Where Codex is; null where it isn't installed; undefined until looked for. */
  info: CodexInfo | null | undefined
  catalog: Catalog
  /** Skills switched off in Codex itself as it was last read, Lodestar's own among them. */
  off: string[]
  /** codex.json: null while Lodestar has never changed Codex (it loads every skill). */
  record: CodexRecord | null
  isRefreshing: boolean
  /** What went wrong last time Codex was read or changed; null when nothing did. */
  error: string | null
}

export type DataState = {
  isReady: boolean
  isSample: boolean
  dataDir: string | null
  /** library.json as in use (the defaults while there is none): each platform's Agents and categories, and the settings. */
  value: LibraryValue
  status: LibraryStatus
  catalog: Catalog
  next: NextState | null
  /** Whether the app starts with Windows; null until known. */
  autostart: boolean | null
  /** The time the displays go by, moved on every half minute. */
  now: number
  codex: CodexState
}

/** What the pages change. The Agents and categories are those of the platform the actions were made for. */
export type Actions = {
  /** Saves an Agent (`original` null for a new one), keeping its place in the list. */
  saveAgent(original: string | null, name: string, preset: Preset): Promise<void>
  /** Deletes an Agent; when new Codex sessions use it, they go back to every skill. */
  deleteAgent(name: string): Promise<void>
  createGroup(name: string): Promise<void>
  renameGroup(from: string, to: string): Promise<void>
  /** Deletes a group; Agents that used it list its skills one by one. */
  deleteGroup(label: string, members: readonly string[]): Promise<void>
  /** Puts a loose skill into a category, or takes it out; the other categories it is in keep it. */
  setGroupMember(label: string, skill: string, isIn: boolean): Promise<void>
  /**
   * Copies Agents of another platform here, as much of each as this platform has, with the
   * categories they take whole; a name taken here gets the one `rename` gives. Answers the names the copies got.
   */
  copyAgents(from: Platform, names: readonly string[], rename: (name: string, taken: readonly string[]) => string): Promise<string[]>
  /** Copies categories of another platform that this one lacks; answers how many it copied. */
  copyCategories(from: Platform, labels: readonly string[]): Promise<number>
  setPrefs(change: Partial<Prefs>): Promise<void>
  /** Puts Claude Code's Agents and categories back to the plugin's own; other platforms' stay. */
  resetDefaults(): Promise<void>
  /** Offers a set to the next session's card. */
  prepareNext(basedOn: string | null, preset: Preset): Promise<void>
  clearNext(): Promise<void>
  setAutostart(isOn: boolean): Promise<void>
  openDataDir(): Promise<void>
  openUrl(url: string): Promise<void>
  /** Reads Codex's skills again, from Codex itself. */
  refreshCodex(): Promise<void>
  /** New Codex sessions load this Agent's skills from now on (null: every skill); answers how many it switched off. */
  useForCodex(agent: string | null): Promise<number>
  /** Opens Codex's folder, where its config.toml is. */
  openCodexDir(): Promise<void>
}

/** A name already taken, found when the file is read again right before saving. */
export class NameTakenError extends Error {}

const INITIAL: DataState = {
  isReady: false,
  isSample: false,
  dataDir: null,
  value: defaultLibrary(),
  status: { kind: 'missing' },
  catalog: { exists: false, updatedAt: null, alwaysOn: DEFAULTS.alwaysOn, skills: [] },
  next: null,
  autostart: null,
  now: Date.now(),
  codex: {
    info: undefined,
    catalog: { exists: false, updatedAt: null, alwaysOn: [...CODEX_ALWAYS_ON], skills: [] },
    off: [],
    record: null,
    isRefreshing: false,
    error: null,
  },
}

/** How often Codex's skills are read again while the app runs, and at most how often when its window comes forward. */
const CODEX_EVERY_MS = 10 * 60_000
const CODEX_ON_FOCUS_MS = 60_000

/** A Codex catalog file's text as the state holds it, Codex's always-on skills where the file names none. */
function codexCatalogOf(text: string | null): Catalog {
  const catalog = parseCatalog(text)
  return text !== null && /"alwaysOn"/.test(text) ? catalog : { ...catalog, alwaysOn: [...CODEX_ALWAYS_ON] }
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 240)
}

/** How long a burst of file events settles before the file is read. */
const SETTLE_MS = 120
/** A file read half written (the plugin writes in place) is read again after this long. */
const RETRY_MS = 250

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function useData(): { state: DataState; actionsFor: (platform: Platform) => Actions } {
  const [state, setState] = useState<DataState>(INITIAL)
  const current = useRef(state)
  current.current = state

  const readLibrary = useCallback(async (b: Backend): Promise<Pick<DataState, 'value' | 'status'>> => {
    let read = parseLibrary(await b.read(FILES.library))
    if (read.status.kind === 'invalid') {
      await wait(RETRY_MS)
      read = parseLibrary(await b.read(FILES.library))
    }
    // A broken file is left alone: the last good copy stays in use until a change saves over it.
    return { value: read.value ?? current.current.value, status: read.status }
  }, [])

  const reload = useCallback(
    async (name: FileName): Promise<void> => {
      const b = await backend()
      try {
        if (name === FILES.library) {
          const read = await readLibrary(b)
          setState(old => ({ ...old, ...read }))
        } else if (name === FILES.catalog) {
          const catalog = parseCatalog(await b.read(FILES.catalog))
          setState(old => ({ ...old, catalog }))
        } else if (name === FILES.next) {
          const next = parseNext(await b.read(FILES.next), Date.now())
          setState(old => ({ ...old, next }))
        } else if (name === FILES.codexCatalog) {
          const text = await b.read(FILES.codexCatalog)
          setState(old => ({ ...old, codex: { ...old.codex, catalog: codexCatalogOf(text), off: parseCodexOff(text) } }))
        } else if (name === FILES.codex) {
          const record = parseCodexRecord(await b.read(FILES.codex))
          setState(old => ({ ...old, codex: { ...old.codex, record } }))
        }
      } catch (error) {
        if (name === FILES.library) {
          setState(old => ({ ...old, status: { kind: 'unreadable', error: String(error).slice(0, 160) } }))
        }
      }
    },
    [readLibrary],
  )

  // Codex's skills, read from Codex itself (a second or so): one read at a time, and the file kept for the next start.
  const codexRead = useRef<Promise<Catalog | null> | null>(null)
  const codexReadAt = useRef(0)
  const refreshCodex = useCallback((): Promise<Catalog | null> => {
    if (codexRead.current !== null) return codexRead.current
    const work = (async (): Promise<Catalog | null> => {
      const b = await backend()
      if (current.current.codex.info == null) return null
      codexReadAt.current = Date.now()
      setState(old => ({ ...old, codex: { ...old.codex, isRefreshing: true } }))
      try {
        const listed = await b.codex.skills()
        const text = codexCatalogText(listed.skills, Date.now())
        await b.write(FILES.codexCatalog, text)
        const catalog = codexCatalogOf(text)
        setState(old => ({
          ...old,
          codex: { ...old.codex, catalog, off: parseCodexOff(text), isRefreshing: false, error: null },
        }))
        return catalog
      } catch (error) {
        setState(old => ({ ...old, codex: { ...old.codex, isRefreshing: false, error: errorText(error) } }))
        return null
      }
    })().finally(() => {
      codexRead.current = null
    })
    codexRead.current = work
    return work
  }, [])

  // The first read, then a read of each file the plugin or a person changes.
  useEffect(() => {
    let isLive = true
    const timers = new Map<FileName, ReturnType<typeof setTimeout>>()
    let stop = (): void => undefined
    void (async () => {
      const b = await backend()
      const [dataDir, library, catalogText, nextText, autostart, codexText, recordText] = await Promise.all([
        b.dataDir(),
        readLibrary(b).catch(error => ({ value: INITIAL.value, status: { kind: 'unreadable' as const, error: String(error) } })),
        b.read(FILES.catalog).catch(() => null),
        b.read(FILES.next).catch(() => null),
        b.autostart.isEnabled().catch(() => null),
        b.read(FILES.codexCatalog).catch(() => null),
        b.read(FILES.codex).catch(() => null),
      ])
      if (!isLive) return
      // Codex used Claude Code's Agents before it had its own: the one it uses moves into Codex's library, once.
      const record = parseCodexRecord(recordText)
      const codexCatalog = codexCatalogOf(codexText)
      const moved = library.status.kind === 'ok' ? movedCodexLibrary(library.value, record, codexCatalog.skills) : null
      let value = library.value
      if (moved !== null) {
        try {
          await b.write(FILES.library, libraryFileText(moved.library, moved.prefs, moved.extra))
          value = moved
        } catch {
          // Moved at the next start.
        }
      }
      if (!isLive) return
      setState(old => ({
        ...old,
        ...library,
        value,
        isReady: true,
        isSample: b.isSample,
        dataDir,
        catalog: parseCatalog(catalogText),
        next: parseNext(nextText, Date.now()),
        autostart,
        codex: { ...old.codex, catalog: codexCatalog, off: parseCodexOff(codexText), record },
      }))
      stop = b.watch(name => {
        clearTimeout(timers.get(name))
        timers.set(name, setTimeout(() => void reload(name), SETTLE_MS))
      })
      // Codex is looked for after the page has drawn, then asked for its skills.
      const info = await b.codex.info().catch(() => null)
      if (!isLive) return
      setState(old => ({ ...old, codex: { ...old.codex, info } }))
      current.current = { ...current.current, codex: { ...current.current.codex, info } }
      if (info !== null) void refreshCodex()
    })()
    const tick = setInterval(() => {
      setState(old => ({ ...old, now: Date.now() }))
      // A prepared set expires with time alone, no file changing.
      void reload(FILES.next)
    }, 30_000)
    // Skills installed in Codex meanwhile: read again now and then, and when the window comes forward.
    const codexTick = setInterval(() => void refreshCodex(), CODEX_EVERY_MS)
    const focused = (): void => {
      if (Date.now() - codexReadAt.current > CODEX_ON_FOCUS_MS) void refreshCodex()
    }
    window.addEventListener('focus', focused)

    return () => {
      isLive = false
      stop()
      clearInterval(tick)
      clearInterval(codexTick)
      window.removeEventListener('focus', focused)
      timers.forEach(timer => clearTimeout(timer))
    }
  }, [readLibrary, reload, refreshCodex])

  // The window starts hidden; it shows once the page has data to draw.
  useEffect(() => {
    if (!state.isReady) return
    const frame = requestAnimationFrame(() => void backend().then(b => b.ready()))
    return () => cancelAnimationFrame(frame)
  }, [state.isReady])

  /** Switches Codex to one of its Agents (null: every skill), worked out from library.json and Codex's skills as they are now. */
  const applyCodex = useCallback(
    async (agent: string | null): Promise<number> => {
      const b = await backend()
      try {
        const fresh = libraryOf(parseLibrary(await b.read(FILES.library)).value ?? current.current.value, 'codex')
        const preset = agent === null ? null : fresh.presets[agent]
        if (preset === undefined) throw new Error(`Codex has no Agent "${agent}"`)
        let catalog = current.current.codex.catalog
        if (agent !== null && catalog.skills.length === 0) catalog = (await refreshCodex()) ?? catalog
        if (agent !== null && catalog.skills.length === 0) throw new Error("Codex's skills couldn't be read")
        const names = codexSwitchOff(catalog.skills, fresh, preset, catalog.alwaysOn)
        await b.codex.apply(agent, names)
        const record = parseCodexRecord(await b.read(FILES.codex))
        setState(old => ({ ...old, codex: { ...old.codex, record, error: null } }))
        // Codex's own view of what is switched off, Lodestar's entries included.
        void refreshCodex()
        return names.length
      } catch (error) {
        setState(old => ({ ...old, codex: { ...old.codex, error: errorText(error) } }))
        throw error
      }
    },
    [refreshCodex],
  )

  const actionsFor = useMemo(() => {
    /** Applies a change to library.json as it is on disk now (the plugin may have changed it), and saves it. */
    const mutate = async (change: (value: LibraryValue) => LibraryValue): Promise<void> => {
      const b = await backend()
      const fresh = parseLibrary(await b.read(FILES.library))
      const next = change(fresh.value ?? current.current.value)
      await b.write(FILES.library, libraryFileText(next.library, next.prefs, next.extra))
      setState(old => ({ ...old, value: next, status: { kind: 'ok' } }))
    }
    /** The skills a platform has, as last read. */
    const skillsOf = (platform: Platform): SkillEntry[] =>
      platform === 'claude' ? current.current.catalog.skills : current.current.codex.catalog.skills

    const shared = {
      setPrefs: (change: Partial<Prefs>) => mutate(value => ({ ...value, prefs: { ...value.prefs, ...change } })),
      resetDefaults: () => mutate(value => ({ ...value, library: { groups: DEFAULTS.groups, presets: DEFAULTS.presets } })),
      prepareNext: async (basedOn: string | null, preset: Preset) => {
        const b = await backend()
        const now = Date.now()
        const text = nextFileText(basedOn, preset.groups, preset.skills, now)
        await b.write(FILES.next, text)
        setState(old => ({ ...old, now, next: parseNext(text, now) }))
      },
      clearNext: async () => {
        const b = await backend()
        await b.remove(FILES.next)
        setState(old => ({ ...old, next: null }))
      },
      setAutostart: async (isOn: boolean) => {
        const b = await backend()
        await b.autostart.set(isOn)
        setState(old => ({ ...old, autostart: isOn }))
      },
      openDataDir: async () => (await backend()).openDataDir(),
      openUrl: async (url: string) => (await backend()).openUrl(url),
      refreshCodex: async () => {
        await refreshCodex()
      },
      useForCodex: (agent: string | null) => applyCodex(agent),
      openCodexDir: async () => (await backend()).codex.openDir(),
    }

    const forPlatform = (platform: Platform): Actions => {
      /** Changes this platform's categories and Agents, the other platforms' left as they are. */
      const edit = (change: (library: Library) => Library): Promise<void> =>
        mutate(value => withLibrary(value, platform, change(libraryOf(value, platform))))
      /** Whether new Codex sessions use this platform's Agent `name`. */
      const isCodexOn = (name: string): boolean => platform === 'codex' && current.current.codex.record?.agent === name

      return {
        ...shared,
        saveAgent: async (original, name, preset) => {
          await edit(library => {
            const presets = library.presets
            if (name !== original && name in presets) throw new NameTakenError(name)
            const isNew = original === null || !(original in presets)
            const entries = Object.entries(presets).map(([key, one]) => (key === original ? ([name, preset] as const) : ([key, one] as const)))
            return { ...library, presets: Object.fromEntries(isNew ? [...entries, [name, preset]] : entries) }
          })
          // Codex follows its Agent to the new name.
          if (original !== null && original !== name && isCodexOn(original)) await applyCodex(name).catch(() => undefined)
        },
        deleteAgent: async name => {
          await edit(library => ({ ...library, presets: Object.fromEntries(Object.entries(library.presets).filter(([key]) => key !== name)) }))
          // Codex doesn't keep loading an Agent that is gone: new sessions see every skill again.
          if (isCodexOn(name)) await applyCodex(null).catch(() => undefined)
        },
        createGroup: name =>
          edit(library => {
            if (name in library.groups) throw new NameTakenError(name)
            return { ...library, groups: { ...library.groups, [name]: [] } }
          }),
        renameGroup: (from, to) =>
          edit(library => {
            if (to !== from && to in library.groups) throw new NameTakenError(to)
            return renameIn(library, from, to)
          }),
        deleteGroup: (label, members) =>
          edit(library => {
            // Agents that took the whole category keep its skills, as this platform has them now.
            const group = groupSkills(skillsOf(platform), library.groups, true).find(one => one.id === `g:${label}`)
            return dropGroup(library, label, [...new Set([...members, ...(group?.names ?? [])])])
          }),
        setGroupMember: (label, skill, isIn) => edit(library => ({ ...library, groups: setMember(library.groups, label, skill, isIn) })),
        copyAgents: async (from, names, rename) => {
          let given: string[] = []
          await mutate(value => {
            const copied = copyInto(libraryOf(value, from), libraryOf(value, platform), names, skillsOf(platform), rename)
            given = copied.names
            return withLibrary(value, platform, copied.library)
          })
          return given
        },
        copyCategories: async (from, labels) => {
          let count = 0
          await mutate(value => {
            const library = libraryOf(value, platform)
            const copies = categoryCopies(libraryOf(value, from), library, skillsOf(platform)).filter(one => labels.includes(one.label))
            count = copies.length
            const groups = { ...library.groups, ...Object.fromEntries(copies.map(one => [one.label, one.patterns])) }
            return withLibrary(value, platform, { ...library, groups })
          })
          return count
        },
      }
    }

    const made = new Map<Platform, Actions>()
    return (platform: Platform): Actions => {
      const kept = made.get(platform)
      if (kept !== undefined) return kept
      const fresh = forPlatform(platform)
      made.set(platform, fresh)
      return fresh
    }
  }, [refreshCodex, applyCodex])

  // Keeps new Codex sessions on the Agent picked for them as it changes: an edit to the Agent or its
  // categories, a skill installed in Codex. A switch that failed isn't tried again until something changes.
  const failed = useRef<string | null>(null)
  const codexLibrary = useMemo(() => libraryOf(state.value, 'codex'), [state.value])
  useEffect(() => {
    const { info, record, catalog } = state.codex
    if (!state.isReady || info == null || record === null || record.agent === null || catalog.skills.length === 0) return
    const preset = codexLibrary.presets[record.agent]
    if (preset === undefined) return
    const names = codexSwitchOff(catalog.skills, codexLibrary, preset, catalog.alwaysOn)
    if (sameSwitchOff(names, record.names)) return
    const attempt = `${record.agent}\n${[...names].sort().join('\n')}`
    if (failed.current === attempt) return
    void applyCodex(record.agent).catch(() => {
      failed.current = attempt
    })
  }, [state.isReady, state.codex, codexLibrary, applyCodex])

  return { state, actionsFor }
}
