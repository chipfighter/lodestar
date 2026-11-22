import { describe, expect, it } from 'vitest'

import { libraryFileText, readNextSession } from '@shared/listing'
import { DEFAULTS, nextFileText, parseCatalog, parseLibrary, parseNext } from './files'
import { buildModel, presetSkills, selectionPreset } from './model'
import { sampleFiles } from './sample'

describe('library.json', () => {
  it('keeps the fields another tool added when the client writes it back', () => {
    const text = JSON.stringify({ version: 1, agents: { A: { skills: ['x'] } }, language: 'en', theirs: { keep: true } })
    const read = parseLibrary(text)
    expect(read.status).toEqual({ kind: 'ok' })
    const value = read.value!
    const again = JSON.parse(libraryFileText(value.library, value.prefs, value.extra)) as Record<string, unknown>
    expect(again.theirs).toEqual({ keep: true })
    expect(again.language).toBe('en')
    expect(again.agents).toEqual({ A: { groups: [], skills: ['x'] } })
  })

  it('tells a missing file from a broken one', () => {
    expect(parseLibrary(null).status.kind).toBe('missing')
    expect(parseLibrary('{ half').status.kind).toBe('invalid')
    expect(parseLibrary('[]').status.kind).toBe('invalid')
  })
})

describe('next-session.json', () => {
  const now = Date.parse('2026-11-23T10:00:00Z')

  it('writes what the plugin reads', () => {
    const text = nextFileText('Coding', ['g:图'], ['code-review'], now)
    expect(readNextSession(JSON.parse(text), now + 60_000)).toEqual({
      basedOn: 'Coding',
      preset: { groups: ['g:图'], skills: ['code-review'] },
      createdAt: now,
    })
  })

  it('reads as ready, taken by a session, or past its two hours', () => {
    const text = nextFileText(null, [], ['code-review'], now)
    expect(parseNext(text, now)?.kind).toBe('ready')
    expect(parseNext(text, now + 2 * 60 * 60 * 1000 + 1)?.kind).toBe('expired')
    const used = JSON.stringify({ ...JSON.parse(text), usedBy: 'S1' })
    expect(parseNext(used, now)?.kind).toBe('used')
    expect(parseNext(null, now)).toBe(null)
    expect(parseNext('not json', now)).toBe(null)
  })
})

describe('claude-code-skills.json', () => {
  it('reads the skills, their descriptions and the always-on list; a missing file lists none', () => {
    const catalog = parseCatalog(sampleFiles(0)['claude-code-skills.json'] ?? null)
    expect(catalog.exists).toBe(true)
    expect(catalog.skills.find(skill => skill.name === 'code-review')?.description).toContain('Review')
    expect(catalog.alwaysOn).toEqual(DEFAULTS.alwaysOn)
    expect(parseCatalog(null)).toMatchObject({ exists: false, skills: [] })
  })
})

describe('the model', () => {
  it('works out an Agent as the plugin does, and saves a selection back to the same Agent', () => {
    const files = sampleFiles(0)
    const value = parseLibrary(files['library.json'] ?? null).value!
    const catalog = parseCatalog(files['claude-code-skills.json'] ?? null)
    const model = buildModel(catalog.skills, value.library, catalog.alwaysOn)
    const video = value.library.presets['视频制作']!
    const picked = presetSkills(model, video)
    expect([...picked].sort()).toEqual(
      [
        'figma:figma-create-design-system-rules',
        'figma:figma-generate-design',
        'figma:figma-use',
        'hyperframes',
        'image-prompt',
        'media-use',
        'remotion-captions',
        'remotion-render',
      ].sort(),
    )
    expect(selectionPreset(model, picked)).toEqual({ groups: ['g:视频剪辑', 'p:figma'], skills: ['image-prompt'] })
    // Always-on skills are in every set and never saved into one.
    expect(model.always.has('update-config')).toBe(true)
    expect(picked.has('update-config')).toBe(false)
    expect(model.usedBy.get('code-review')).toEqual(['Coding'])
  })
})
