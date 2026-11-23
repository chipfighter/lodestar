// The client's state: the data folder's files as last read, kept fresh as the
// plugin (or a person) changes them, and the changes the pages make.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { deleteGroup as dropGroup, libraryFileText, renameGroup as renameIn, setMember } from '@shared/listing'
import type { Preset, Prefs } from '../../../plugin/types'
import { backend, type Backend } from './backend'
import {
  DEFAULTS,
  FILES,
  defaultLibrary,
  nextFileText,
  parseCatalog,
  parseLibrary,
  parseNext,
  type Catalog,
  type FileName,
  type LibraryStatus,
  type LibraryValue,
  type NextState,
} from './files'

export type DataState = {
  isReady: boolean
  isSample: boolean
  dataDir: string | null
  /** The Agents, groups and settings in use: library.json's, or the defaults while there is none. */
  value: LibraryValue
  status: LibraryStatus
  catalog: Catalog
  next: NextState | null
  /** Whether the app starts with Windows; null until known. */
  autostart: boolean | null
  /** The time the displays go by, moved on every half minute. */
  now: number
}

export type Actions = {
  /** Saves an Agent (`original` null for a new one), keeping its place in the list. */
  saveAgent(original: string | null, name: string, preset: Preset): Promise<void>
  deleteAgent(name: string): Promise<void>
  createGroup(name: string): Promise<void>
  renameGroup(from: string, to: string): Promise<void>
  /** Deletes a group; Agents that used it list its skills one by one. */
  deleteGroup(label: string, members: readonly string[]): Promise<void>
  /** Puts a loose skill into a category, or takes it out; the other categories it is in keep it. */
  setGroupMember(label: string, skill: string, isIn: boolean): Promise<void>
  setPrefs(change: Partial<Prefs>): Promise<void>
  resetDefaults(): Promise<void>
  /** Offers a set to the next session's card. */
  prepareNext(basedOn: string | null, preset: Preset): Promise<void>
  clearNext(): Promise<void>
  setAutostart(isOn: boolean): Promise<void>
  openDataDir(): Promise<void>
  openUrl(url: string): Promise<void>
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
}

/** How long a burst of file events settles before the file is read. */
const SETTLE_MS = 120
/** A file read half written (the plugin writes in place) is read again after this long. */
const RETRY_MS = 250

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export function useData(): { state: DataState; actions: Actions } {
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
        }
      } catch (error) {
        if (name === FILES.library) {
          setState(old => ({ ...old, status: { kind: 'unreadable', error: String(error).slice(0, 160) } }))
        }
      }
    },
    [readLibrary],
  )

  // The first read, then a read of each file the plugin or a person changes.
  useEffect(() => {
    let isLive = true
    const timers = new Map<FileName, ReturnType<typeof setTimeout>>()
    let stop = (): void => undefined
    void (async () => {
      const b = await backend()
      const [dataDir, library, catalogText, nextText, autostart] = await Promise.all([
        b.dataDir(),
        readLibrary(b).catch(error => ({ value: INITIAL.value, status: { kind: 'unreadable' as const, error: String(error) } })),
        b.read(FILES.catalog).catch(() => null),
        b.read(FILES.next).catch(() => null),
        b.autostart.isEnabled().catch(() => null),
      ])
      if (!isLive) return
      setState(old => ({
        ...old,
        ...library,
        isReady: true,
        isSample: b.isSample,
        dataDir,
        catalog: parseCatalog(catalogText),
        next: parseNext(nextText, Date.now()),
        autostart,
      }))
      stop = b.watch(name => {
        clearTimeout(timers.get(name))
        timers.set(name, setTimeout(() => void reload(name), SETTLE_MS))
      })
    })()
    const tick = setInterval(() => {
      setState(old => ({ ...old, now: Date.now() }))
      // A prepared set expires with time alone, no file changing.
      void reload(FILES.next)
    }, 30_000)

    return () => {
      isLive = false
      stop()
      clearInterval(tick)
      timers.forEach(timer => clearTimeout(timer))
    }
  }, [readLibrary, reload])

  // The window starts hidden; it shows once the page has data to draw.
  useEffect(() => {
    if (!state.isReady) return
    const frame = requestAnimationFrame(() => void backend().then(b => b.ready()))
    return () => cancelAnimationFrame(frame)
  }, [state.isReady])

  const actions = useMemo<Actions>(() => {
    /** Applies a change to library.json as it is on disk now (the plugin may have changed it), and saves it. */
    const mutate = async (change: (value: LibraryValue) => LibraryValue): Promise<void> => {
      const b = await backend()
      const fresh = parseLibrary(await b.read(FILES.library))
      const next = change(fresh.value ?? current.current.value)
      await b.write(FILES.library, libraryFileText(next.library, next.prefs, next.extra))
      setState(old => ({ ...old, value: next, status: { kind: 'ok' } }))
    }

    return {
      saveAgent: (original, name, preset) =>
        mutate(value => {
          const presets = value.library.presets
          if (name !== original && name in presets) throw new NameTakenError(name)
          const isNew = original === null || !(original in presets)
          const entries = Object.entries(presets).map(([key, one]) => (key === original ? ([name, preset] as const) : ([key, one] as const)))
          const next = Object.fromEntries(isNew ? [...entries, [name, preset]] : entries)
          return { ...value, library: { ...value.library, presets: next } }
        }),
      deleteAgent: name =>
        mutate(value => ({
          ...value,
          library: { ...value.library, presets: Object.fromEntries(Object.entries(value.library.presets).filter(([key]) => key !== name)) },
        })),
      createGroup: name =>
        mutate(value => {
          if (name in value.library.groups) throw new NameTakenError(name)
          return { ...value, library: { ...value.library, groups: { ...value.library.groups, [name]: [] } } }
        }),
      renameGroup: (from, to) =>
        mutate(value => {
          if (to !== from && to in value.library.groups) throw new NameTakenError(to)
          return { ...value, library: renameIn(value.library, from, to) }
        }),
      deleteGroup: (label, members) => mutate(value => ({ ...value, library: dropGroup(value.library, label, members) })),
      setGroupMember: (label, skill, isIn) =>
        mutate(value => ({
          ...value,
          library: { ...value.library, groups: setMember(value.library.groups, label, skill, isIn) },
        })),
      setPrefs: change => mutate(value => ({ ...value, prefs: { ...value.prefs, ...change } })),
      resetDefaults: () =>
        mutate(value => ({ ...value, library: { groups: DEFAULTS.groups, presets: DEFAULTS.presets } })),
      prepareNext: async (basedOn, preset) => {
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
      setAutostart: async isOn => {
        const b = await backend()
        await b.autostart.set(isOn)
        setState(old => ({ ...old, autostart: isOn }))
      },
      openDataDir: async () => (await backend()).openDataDir(),
      openUrl: async url => (await backend()).openUrl(url),
    }
  }, [])

  return { state, actions }
}
