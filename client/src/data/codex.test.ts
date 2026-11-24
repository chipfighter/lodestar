import { describe, expect, it } from 'vitest'

import { keepUnseen } from '@shared/listing'
import { CODEX_ALWAYS_ON, codexCatalogText, codexEntry, codexSwitchOff, sameSwitchOff, type CodexListed } from './codex'
import { buildModel } from './model'
import { parseCodexOff, parseCodexRecord } from './files'

const LISTED: CodexListed[] = [
  { name: 'image-prompt', description: '摄影提示词', scope: 'user', enabled: true, pluginId: null },
  { name: 'remotion-render', description: 'Export a Remotion video', scope: 'user', enabled: true, pluginId: null },
  { name: 'old-one', description: 'Switched off in Codex', scope: 'user', enabled: false, pluginId: null },
  { name: 'repo-rules', description: "A project's own", scope: 'repo', enabled: true, pluginId: null },
  { name: 'coding-discipline:tdd', description: 'TDD', scope: 'user', enabled: true, pluginId: 'coding-discipline@coding-discipline' },
  { name: 'imagegen', description: 'Make images', scope: 'system', enabled: true, pluginId: null },
  { name: 'review-agent', description: 'Review a change', scope: 'system', enabled: true, pluginId: null },
  { name: 'image-prompt', description: 'listed twice', scope: 'user', enabled: true, pluginId: null },
]

describe("Codex's skills", () => {
  it('read as Claude Code\'s are: loose ones, plugins by name, Codex\'s own as a source', () => {
    expect(codexEntry(LISTED[0]!)).toMatchObject({ name: 'image-prompt', source: 'userSettings', description: '摄影提示词' })
    expect(codexEntry(LISTED[4]!)).toMatchObject({ source: 'plugin', plugin: 'coding-discipline' })
    expect(codexEntry(LISTED[5]!)).toMatchObject({ source: 'codex-system' })
    // A Chinese description counts a token a character, about as Codex's list line costs.
    expect(codexEntry(LISTED[0]!).tokens).toBeGreaterThan(10)
  })

  it("leave a project's own skills and duplicates out of codex-skills.json, and keep what Codex has switched off", () => {
    const file = JSON.parse(codexCatalogText(LISTED, Date.parse('2026-11-23T10:00:00Z'))) as {
      platform: string
      alwaysOn: string[]
      skills: { name: string; enabled: boolean }[]
    }
    expect(file.platform).toBe('codex')
    expect(file.alwaysOn).toEqual([...CODEX_ALWAYS_ON])
    expect(file.skills.map(skill => skill.name)).toEqual([
      'image-prompt',
      'remotion-render',
      'old-one',
      'coding-discipline:tdd',
      'imagegen',
      'review-agent',
    ])
    expect(parseCodexOff(JSON.stringify(file))).toEqual(['old-one'])
  })
})

describe('an Agent for Codex', () => {
  const skills = LISTED.slice(0, 7).filter(one => one.scope !== 'repo').map(codexEntry)
  const library = {
    groups: { 视频: ['remotion-*', 'image-prompt'] },
    presets: { 视频制作: { groups: ['g:视频', 'p:figma'], skills: ['media-use'] }, 编码: { groups: ['p:coding-discipline'], skills: [] } },
  }

  it('switches off every skill but its own and the ones Codex relies on', () => {
    expect(codexSwitchOff(skills, library, library.presets['视频制作'])).toEqual(['old-one', 'coding-discipline:tdd', 'imagegen'])
    expect(codexSwitchOff(skills, library, library.presets['编码'])).toEqual(['image-prompt', 'remotion-render', 'old-one', 'imagegen'])
    // Every skill: nothing switched off.
    expect(codexSwitchOff(skills, library, null)).toEqual([])
    expect(sameSwitchOff(['b', 'a'], ['a', 'b'])).toBe(true)
  })

  it("keeps what the skill list can't show when it is edited", () => {
    const model = buildModel(skills, library, CODEX_ALWAYS_ON)
    // The category is untouched, the plugin skill is added; figma and media-use aren't listed, so they stay.
    const edited = keepUnseen({ groups: ['g:视频'], skills: ['coding-discipline:tdd'] }, library.presets['视频制作'], model.groups, model.names)
    expect(edited).toEqual({ groups: ['g:视频', 'p:figma'], skills: ['coding-discipline:tdd', 'media-use'] })
    // A group or a skill this platform has, unticked here, goes.
    expect(keepUnseen({ groups: [], skills: [] }, { groups: ['g:视频'], skills: ['imagegen'] }, model.groups, model.names)).toEqual({
      groups: [],
      skills: [],
    })
  })

  it('codex.json reads back what the client wrote', () => {
    const record = parseCodexRecord(JSON.stringify({ version: 1, agent: '视频制作', names: ['imagegen', 3], appliedAt: 5, config: 'x' }))
    expect(record).toEqual({ agent: '视频制作', names: ['imagegen'], appliedAt: 5, config: 'x' })
    expect(parseCodexRecord(JSON.stringify({ agent: null }))?.agent).toBe(null)
    expect(parseCodexRecord('{ broken')).toBe(null)
  })
})
