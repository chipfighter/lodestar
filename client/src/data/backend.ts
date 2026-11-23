// Where the client's files live: the data folder through the Tauri shell, or,
// in a plain browser (`pnpm dev` without Tauri), sample files kept in memory.

import type { CodexApplied, CodexInfo, CodexListed } from './codex'
import { FILES, type FileName } from './files'
import { SAMPLE_CODEX_INFO, sampleCodexSkills, sampleFiles } from './sample'

export type Backend = {
  /** Sample data in memory, not the person's files. */
  isSample: boolean
  /** The data folder's path; null where there is no home folder. */
  dataDir(): Promise<string | null>
  /** A data file's text; null when it is not there. */
  read(name: FileName): Promise<string | null>
  /** Replaces a data file, all at once (never half written). */
  write(name: FileName, text: string): Promise<void>
  remove(name: FileName): Promise<void>
  /** Opens the data folder in Explorer. */
  openDataDir(): Promise<void>
  openUrl(url: string): Promise<void>
  /** Calls `listener` when a data file changes on disk; returns how to stop. */
  watch(listener: (name: FileName) => void): () => void
  autostart: { isEnabled(): Promise<boolean>; set(isOn: boolean): Promise<void> }
  /** Shows the main window once the page has drawn (it starts hidden, so no blank frame flashes). */
  ready(): Promise<void>
  /** The window's title and the tray menu's rows, in the language shown. */
  setLabels(title: string, open: string, quit: string): Promise<void>
  codex: {
    /** Where Codex is; null where it isn't installed. */
    info(): Promise<CodexInfo | null>
    /** Every skill Codex has, as Codex lists them. */
    skills(): Promise<{ skills: CodexListed[]; errors: unknown[] }>
    /** Switches `names` off for new Codex sessions, for the Agent `agent` (null: every skill), and notes it in codex.json. */
    apply(agent: string | null, names: readonly string[]): Promise<CodexApplied>
    /** Opens Codex's folder in Explorer. */
    openDir(): Promise<void>
  }
}

const NAMES = new Set<string>(Object.values(FILES))

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')
  const autostart = await import('@tauri-apps/plugin-autostart')
  const opener = await import('@tauri-apps/plugin-opener')

  return {
    isSample: false,
    dataDir: () => invoke<string | null>('data_dir'),
    read: name => invoke<string | null>('read_data', { name }),
    write: (name, text) => invoke<void>('write_data', { name, text }),
    remove: name => invoke<void>('remove_data', { name }),
    openDataDir: () => invoke<void>('open_data_dir'),
    openUrl: url => opener.openUrl(url),
    watch: listener => {
      const stop = listen<string>('data-changed', event => {
        if (NAMES.has(event.payload)) listener(event.payload as FileName)
      })
      return () => void stop.then(unlisten => unlisten())
    },
    autostart: {
      isEnabled: () => autostart.isEnabled(),
      set: isOn => (isOn ? autostart.enable() : autostart.disable()),
    },
    ready: () => invoke<void>('show_main'),
    setLabels: (title, open, quit) => invoke<void>('set_labels', { title, open, quit }),
    codex: {
      info: () => invoke<CodexInfo | null>('codex_info'),
      skills: () => invoke<{ skills: CodexListed[]; errors: unknown[] }>('codex_skills'),
      apply: (agent, names) => invoke<CodexApplied>('codex_apply', { agent, names }),
      openDir: () => invoke<void>('open_codex_dir'),
    },
  }
}

function memoryBackend(): Backend {
  const isPrepared = new URLSearchParams(window.location.search).has('prepared')
  const files = new Map<FileName, string>(Object.entries(sampleFiles(Date.now(), isPrepared, navigator.language)) as [FileName, string][])
  const listeners = new Set<(name: FileName) => void>()
  let isAutostart = false

  return {
    isSample: true,
    dataDir: async () => 'C:\\Users\\you\\.skill-loadout',
    read: async name => files.get(name) ?? null,
    write: async (name, text) => {
      files.set(name, text)
    },
    remove: async name => {
      files.delete(name)
    },
    openDataDir: async () => undefined,
    openUrl: async url => {
      window.open(url, '_blank', 'noopener')
    },
    watch: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    autostart: {
      isEnabled: async () => isAutostart,
      set: async isOn => {
        isAutostart = isOn
      },
    },
    ready: async () => undefined,
    setLabels: async () => undefined,
    // Codex as a person who has it might: its skills, and a config.toml kept only as codex.json says.
    // `?nocodex` previews the client where Codex isn't installed.
    codex: {
      info: async () => (new URLSearchParams(window.location.search).has('nocodex') ? null : SAMPLE_CODEX_INFO),
      skills: async () => {
        const off = new Set<string>(JSON.parse(files.get(FILES.codex) ?? '{}').names ?? [])
        return { skills: sampleCodexSkills().map(skill => (off.has(skill.name) ? { ...skill, enabled: false } : skill)), errors: [] }
      },
      apply: async (agent, names) => {
        const before: string[] = JSON.parse(files.get(FILES.codex) ?? '{}').names ?? []
        const record = { version: 1, agent, names, appliedAt: Date.now(), config: SAMPLE_CODEX_INFO.config }
        files.set(FILES.codex, `${JSON.stringify(record, null, 2)}\n`)
        return { switchedOff: names.length, removed: before.length, config: SAMPLE_CODEX_INFO.config, backup: null }
      },
      openDir: async () => undefined,
    },
  }
}

let chosen: Promise<Backend> | undefined

export function backend(): Promise<Backend> {
  chosen ??= isTauri() ? tauriBackend() : Promise.resolve(memoryBackend())
  return chosen
}
