import { describe, expect, it } from 'vitest'

import { EMPTY_LIBRARY, agentCopy, categoryCopies, copyAgents, libraryFileText, readLibraryFile } from '@shared/listing'
import type { Library, SkillEntry } from '../../../plugin/types'
import { CODEX_ALWAYS_ON, codexSwitchOff } from './codex'
import { libraryOf, movedCodexLibrary, parseLibrary, withLibrary, type LibraryValue } from './files'

const CLAUDE: Library = {
  groups: { 视频: ['remotion-*', 'media-use'], 写作: ['meeting-notes'] },
  presets: {
    视频制作: { groups: ['g:视频', 'p:figma'], skills: ['image-prompt', 'claude-api'] },
    Coding: { groups: [], skills: ['code-review', 'sql-helper'] },
    写作助手: { groups: ['g:写作'], skills: [] },
  },
}

/** Codex's skills: some of the same loose ones, its own plugins and system skills. */
const CODEX_SKILLS: SkillEntry[] = [
  { name: 'image-prompt', source: 'userSettings' },
  { name: 'remotion-render', source: 'userSettings' },
  { name: 'sql-helper', source: 'userSettings' },
  { name: 'coding-discipline:tdd', source: 'plugin', plugin: 'coding-discipline' },
  { name: 'imagegen', source: 'codex-system' },
  { name: 'review-agent', source: 'codex-system' },
]

function value(extra: Record<string, unknown> = {}): LibraryValue {
  return { library: CLAUDE, prefs: { askOnNewSession: true, subagentPicker: 'agent', language: 'auto' }, extra }
}

describe("each platform's own Agents and categories", () => {
  it("keep Claude Code's at the top of library.json and another platform's under platforms", () => {
    const codex: Library = { groups: { 代码: ['sql-*'] }, presets: { Coding: { groups: ['g:代码'], skills: [] } } }
    const written = withLibrary(value({ client: { window: [800, 600] } }), 'codex', codex)
    const text = libraryFileText(written.library, written.prefs, written.extra)
    const file = JSON.parse(text) as Record<string, unknown>
    expect(file['agents']).toEqual(CLAUDE.presets)
    expect(file['platforms']).toEqual({ codex: { groups: codex.groups, agents: codex.presets } })
    expect(file['client']).toEqual({ window: [800, 600] })
    // Read back, each platform gets its own; Codex has none before its block is there.
    const read = parseLibrary(text).value!
    expect(libraryOf(read, 'claude')).toEqual(CLAUDE)
    expect(libraryOf(read, 'codex')).toEqual(codex)
    expect(libraryOf(value(), 'codex')).toEqual(EMPTY_LIBRARY)
    // A change to Claude Code's leaves Codex's block alone, and fields of the block this doesn't know stay.
    const both = withLibrary(withLibrary(read, 'claude', EMPTY_LIBRARY), 'codex', codex)
    expect(libraryOf(both, 'codex')).toEqual(codex)
    const kept = readLibraryFile({ platforms: { codex: { agents: {}, note: 'x' }, cursor: { agents: { A: {} } } } })!
    const again = withLibrary(kept, 'codex', codex).extra['platforms'] as Record<string, Record<string, unknown>>
    expect(again['codex']?.['note']).toBe('x')
    expect(again['cursor']).toEqual({ agents: { A: {} } })
  })
})

describe('copying from another platform', () => {
  it('brings the parts the platform has, with the categories the Agent takes whole', () => {
    const copy = agentCopy(CLAUDE, EMPTY_LIBRARY, '视频制作', CODEX_SKILLS)
    // Figma and claude-api aren't in Codex; the category comes along with only its patterns.
    expect(copy).toEqual({
      preset: { groups: ['g:视频'], skills: ['image-prompt'] },
      categories: { 视频: ['remotion-*', 'media-use'] },
      size: 2,
    })
    // A category with none of its skills there stays behind, and the Agent with it.
    expect(agentCopy(CLAUDE, EMPTY_LIBRARY, '写作助手', CODEX_SKILLS)).toEqual({ preset: { groups: [], skills: [] }, categories: {}, size: 0 })
    // One of the same name there is used as it is.
    const own: Library = { groups: { 视频: ['image-prompt'] }, presets: {} }
    expect(agentCopy(CLAUDE, own, '视频制作', CODEX_SKILLS)?.categories).toEqual({})
    expect(agentCopy(CLAUDE, own, '视频制作', CODEX_SKILLS)?.size).toBe(1)
    expect(agentCopy(CLAUDE, own, 'nobody', CODEX_SKILLS)).toBe(undefined)
  })

  it('gives a copy a free name when the platform already has one', () => {
    const there: Library = { groups: {}, presets: { Coding: { groups: ['p:coding-discipline'], skills: [] } } }
    const copied = copyAgents(CLAUDE, there, ['Coding', '视频制作'], CODEX_SKILLS, name => `${name} copy`)
    expect(copied.names).toEqual(['Coding copy', '视频制作'])
    expect(Object.keys(copied.library.presets)).toEqual(['Coding', 'Coding copy', '视频制作'])
    expect(copied.library.presets['Coding copy']).toEqual({ groups: [], skills: ['sql-helper'] })
    expect(copied.library.groups).toEqual({ 视频: ['remotion-*', 'media-use'] })
  })

  it('offers the categories the platform lacks and has skills for', () => {
    expect(categoryCopies(CLAUDE, EMPTY_LIBRARY, CODEX_SKILLS)).toEqual([{ label: '视频', patterns: ['remotion-*', 'media-use'], size: 1 }])
    expect(categoryCopies(CLAUDE, { groups: { 视频: [] }, presets: {} }, CODEX_SKILLS)).toEqual([])
  })
})

describe('moving Codex onto Agents of its own', () => {
  const record = { agent: '视频制作', names: [], appliedAt: 1, config: null }

  it('copies the Agent Codex used, so new Codex sessions keep the same skills', () => {
    const moved = movedCodexLibrary(value(), record, CODEX_SKILLS)!
    const codex = libraryOf(moved, 'codex')
    expect(Object.keys(codex.presets)).toEqual(['视频制作'])
    expect(moved.library).toEqual(CLAUDE)
    const before = codexSwitchOff(CODEX_SKILLS, CLAUDE, CLAUDE.presets['视频制作']!, CODEX_ALWAYS_ON)
    expect(codexSwitchOff(CODEX_SKILLS, codex, codex.presets['视频制作']!, CODEX_ALWAYS_ON)).toEqual(before)
    // Codex's skills not read yet: all of it comes over.
    expect(libraryOf(movedCodexLibrary(value(), record, [])!, 'codex').presets['视频制作']).toEqual(CLAUDE.presets['视频制作'])
  })

  it('happens once, and only for an Agent Codex uses', () => {
    const moved = movedCodexLibrary(value(), record, CODEX_SKILLS)!
    expect(movedCodexLibrary(moved, record, CODEX_SKILLS)).toBe(null)
    expect(movedCodexLibrary(value(), { ...record, agent: null }, CODEX_SKILLS)).toBe(null)
    expect(movedCodexLibrary(value(), null, CODEX_SKILLS)).toBe(null)
    expect(movedCodexLibrary(value(), { ...record, agent: 'gone' }, CODEX_SKILLS)).toBe(null)
  })
})
