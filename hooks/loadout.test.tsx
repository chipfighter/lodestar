import { expect, test } from 'claude-code/testing'

import {
  deleteGroup,
  describeSelection,
  entryName,
  filterListing,
  groupSkills,
  inGroup,
  isLoose,
  markerName,
  moveSkills,
  normalizeConfig,
  pickOption,
  promptMark,
  renameGroup,
  setNamedIn,
  resolvePreset,
  toPreset,
  withoutSkill,
  withSkill,
} from './listing'

// In a test the skills come from the listing alone, with no source: a name with a
// colon counts as a plugin's, any other as loose.
const LISTING = [
  'The following skills are available for use with the Skill tool:',
  '',
  '- image-prompt: 把画面想法转成摄影提示词。',
  '- remotion-render: Export a Remotion video',
  '- figma:figma-use',
  '- anthropic-skills:docs: docs (editable docs people share)',
  '  a second line of the docs description',
  '- code-review: Review the current diff',
  '- update-config: Use this skill to configure the harness',
].join('\n')

const NAMES = [
  'image-prompt',
  'remotion-render',
  'figma:figma-use',
  'anthropic-skills:docs',
  'code-review',
  'update-config',
]

const CATALOG = [
  { name: 'image-prompt', source: 'userSettings' },
  { name: 'remotion-render', source: 'userSettings' },
  { name: 'mine', source: 'projectSettings' },
  { name: 'code-review', source: 'built-in' },
  { name: 'figma:figma-use', source: 'plugin', plugin: 'figma' },
]

const PANE = {
  plugin: 'skill-loadout',
  component: 'Pane',
  requestId: 'skill-loadout',
  props: {
    title: '技能装配',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>

const HOME = '/home/me'
const LIBRARY_PATH = `${HOME}/.skill-loadout/library.json`
const CATALOG_PATH = `${HOME}/.skill-loadout/claude-code-skills.json`

/** A library.json as another tool or the person might write it. */
const LIBRARY = {
  version: 1,
  askOnNewSession: true,
  groups: { 图: ['image-*'] },
  agents: { 只要图片: { groups: ['g:图'], skills: [] }, 设计: { groups: ['p:figma'], skills: [] } },
}

const HISTORY = [
  { role: 'user' as const, text: '之前的问题', toolUses: [] },
  { role: 'assistant' as const, text: '之前的回答', toolUses: [] },
]

type Asked = { question: string; options: { label: string; description?: string }[] }
type Spawned = { prompt: string; description: string; agentId: string }
type Fake = {
  store: Map<string, unknown>
  files: Map<string, string>
  asked: Asked[]
  toasts: string[]
  spawned: Spawned[]
  opens: () => number
  /** How many spawns reached the engine, past every plugin's hook. */
  arrived: () => number
  /** Lets a spawn held with `hold` answer. */
  release: () => void
}

/** A subagent as `$.agent.list()` lists it, with only what the plugin reads. */
type Listed = { id: string; description: string; type: string; parentId?: string }

/** What an Agent tool call asks for, and the call's id. */
type AgentCall = { prompt: string; description: string; subagentType: string; toolUseId?: string }

/** A row of the main conversation, as `$.session.messages` gives it. */
type Row = { role: 'user' | 'assistant'; text: string; toolUses: never[]; uuid: string }

/**
 * Stands for the engine: a store, files and a home folder, the session's id and
 * messages (`rows`, read anew at each call, in place of `history`), subagents it
 * spawns as A1, A2... (`agents` as it lists them), and a person who answers the
 * cards with `answers` in turn (null dismisses one).
 */
function engine(
  on: Parameters<Body>[1],
  options: {
    history?: boolean
    sessionId?: () => string
    rows?: () => Row[]
    answers?: (string | null)[]
    files?: Record<string, string>
    agents?: Listed[]
    hold?: boolean
    /** Runs an Agent tool call, as core starts its subagent. */
    onAgent?: (call: AgentCall) => Promise<void>
  } = {},
): Fake {
  const store = new Map<string, unknown>()
  const files = new Map<string, string>(Object.entries(options.files ?? {}))
  const answers = [...(options.answers ?? [])]
  const asked: Asked[] = []
  const toasts: string[] = []
  const spawned: Spawned[] = []
  let opens = 0
  let release = (): void => undefined
  const gate = options.hold === true ? new Promise<void>(resolve => (release = resolve)) : Promise.resolve()
  let arrived = 0
  on('agent.spawn', async (_, e) => {
    arrived += 1
    // With `hold`, the spawn answers only once released: meanwhile the subagent's first request may go out.
    await gate
    const agentId = `A${spawned.length + 1}`
    spawned.push({ prompt: e.prompt, description: e.description, agentId })
    return { model: 'test-model', agentId }
  })
  on('agent.list', () => ({ value: (options.agents ?? []) as never }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  // The engine hands the file hooks absolute paths of the machine the tests run on (`D:\home\me\...` on
  // Windows): kept here as the plugin spelled them.
  const pathOf = (path: string): string => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? HOME : undefined }))
  on('fs.exists', (_, e) => ({ value: files.has(pathOf(e.path)) }))
  on('fs.read', (_, e) => ({ value: files.get(pathOf(e.path)) ?? '' }))
  on('fs.write', (_, e) => {
    files.set(pathOf(e.path), e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'loadout' } }))
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('clock.now', () => ({ value: 0 }))
  on('clock.sleep', () => ({ value: undefined }))
  on('session.id', () => ({ value: options.sessionId?.() ?? 'S1' }))
  on('session.messages', () => ({ value: (options.rows?.() ?? (options.history ? HISTORY : [])) as never }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Agent') {
      const call = { prompt: e.prompt, description: e.description, toolUseId: e.tool_use_id }
      await options.onAgent?.({ ...call, subagentType: e.subagent_type ?? 'general-purpose' })
      return { result: {} as never }
    }
    if (e.tool !== 'AskUserQuestion') return { result: {} }
    const question = e.questions[0]
    if (question === undefined) return { deny: 'no question' }
    asked.push({ question: question.question, options: question.options })
    const answer = answers.shift()
    if (answer === undefined || answer === null) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [question.question]: answer } } }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  return { store, files, asked, toasts, spawned, opens: () => opens, arrived: () => arrived, release: () => release() }
}

/** The model's Agent tool call (or a fork), as the engine raises its spawn. */
async function spawn($: Parameters<Body>[0], call: AgentCall): Promise<void> {
  const { toolUseId, ...asked } = call
  await $.agent.spawn({
    ...asked,
    tool_use_id: toolUseId ?? `toolu_${call.description}`,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'test-model',
    background: false,
    fork: call.subagentType === 'fork',
  })
}

/** A subagent's listing, as the engine sends it in that subagent's loop. */
async function listingOf($: Parameters<Body>[0], agentId: string): Promise<string> {
  const result = await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' }, agentId })
  return result.text ?? ''
}

async function start($: Parameters<Body>[0]): Promise<void> {
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
}

async function listing($: Parameters<Body>[0]): Promise<string> {
  const result = await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
  return result.text ?? ''
}

/** The person sends a message, or a command with `command`. */
async function say($: Parameters<Body>[0], text: string, command?: { name: string; args: string }): Promise<void> {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' }, ...(command ? { command } : {}) })
}

function fileOf(fake: Fake, path: string): Record<string, unknown> {
  return JSON.parse(fake.files.get(path) ?? '{}') as Record<string, unknown>
}

test('a listing line names its skill, colons in the name included', () => {
  expect(entryName('- anthropic-skills:docs: docs (x)', [])).toBe('anthropic-skills:docs')
  expect(entryName('- figma:figma-use', [])).toBe('figma:figma-use')
  expect(entryName('- image-prompt: 摄影', NAMES)).toBe('image-prompt')
  expect(entryName('  continued text', NAMES)).toBe(undefined)
})

test('the filter keeps the header and the allowed entries, continuation lines with them', () => {
  const kept = filterListing(LISTING, new Set(['anthropic-skills:docs', 'update-config']), NAMES)

  expect(kept.hidden).toBe(4)
  expect(kept.text).toContain('The following skills are available')
  expect(kept.text).toContain('a second line of the docs description')
  expect(kept.text).toContain('- update-config:')
  expect(kept.text.includes('image-prompt')).toBe(false)
})

test('only loose skills go into groups; the rest keep the group they came in', () => {
  expect(isLoose({ name: 'image-prompt', source: 'userSettings' })).toBe(true)
  expect(isLoose({ name: 'code-review', source: 'built-in' })).toBe(false)
  expect(isLoose({ name: 'figma:figma-use' })).toBe(false)

  // A group that names a built-in skill does not take it.
  const groups = groupSkills(CATALOG, { 视频: ['image-prompt', 'remotion-*', 'code-review'], 空组: [] })
  const byId = Object.fromEntries(groups.map(group => [group.id, group]))
  expect(groups.map(group => group.id)).toEqual(['g:视频', 'u:', 's:built-in', 'p:figma'])
  expect(byId['g:视频']?.names).toEqual(['image-prompt', 'remotion-render'])
  expect(byId['u:']?.names).toEqual(['mine'])
  expect(byId['s:built-in']?.label).toBe('Claude 自带')
  expect(byId['p:figma']?.tag).toBe('插件')
  expect(groupSkills(CATALOG, { 空组: [] }, true).map(group => group.id)).toContain('g:空组')
})

test('an Agent names whole groups by id and single skills by name', () => {
  const groups = groupSkills(CATALOG, { 视频: ['image-prompt', 'remotion-*'] })
  const names = CATALOG.map(skill => skill.name)

  expect(resolvePreset({ groups: ['g:视频', 's:built-in'], skills: ['mine'] }, groups, names)).toEqual([
    'image-prompt',
    'remotion-render',
    'mine',
    'code-review',
  ])
  // The leftover bucket is never saved as a group: what it holds may change.
  expect(toPreset(['image-prompt', 'remotion-render', 'mine', 'figma:figma-use'], groups)).toEqual({
    groups: ['g:视频', 'p:figma'],
    skills: ['mine'],
  })
  // An Agent written with bare group names reads them as groups of loose skills.
  expect(normalizeConfig({ presets: { 旧: { groups: ['AIGC', 'p:figma'] } } }).presets['旧']).toEqual({
    groups: ['g:AIGC', 'p:figma'],
    skills: [],
  })
})

test('a skill moves in and out of a wildcard group by name', () => {
  expect(inGroup(['remotion-*', '!remotion-render'], 'remotion-render')).toBe(false)
  expect(withoutSkill(['remotion-*'], 'remotion-render')).toEqual(['remotion-*', '!remotion-render'])
  expect(withSkill(['remotion-*', '!remotion-render'], 'remotion-render')).toEqual(['remotion-*'])

  const moved = moveSkills({ AIGC: ['image-prompt'], 剪辑: ['remotion-*'] }, ['remotion-render'], 'AIGC')
  expect(moved['AIGC']).toEqual(['image-prompt', 'remotion-render'])
  expect(moved['剪辑']).toEqual(['remotion-*', '!remotion-render'])
  expect(moveSkills({ AIGC: ['image-prompt'] }, ['image-prompt'], null)['AIGC']).toEqual([])
})

test('renaming and deleting a group keep the Agents that use it working', () => {
  const lib = { groups: { 剪辑: ['remotion-*'] }, presets: { 视频: { groups: ['g:剪辑', 'p:figma'], skills: [] } } }
  const renamed = renameGroup(lib, '剪辑', '剪辑视频')
  expect(renamed.presets['视频']?.groups).toEqual(['g:剪辑视频', 'p:figma'])

  const deleted = deleteGroup(renamed, '剪辑视频', ['remotion-render'])
  expect(Object.keys(deleted.groups)).toEqual([])
  expect(deleted.presets['视频']).toEqual({ groups: ['p:figma'], skills: ['remotion-render'] })
})

test('every skill ticked one by one reads as 不限制', async ($, on) => {
  const groups = groupSkills(CATALOG, {})
  const names = CATALOG.map(skill => skill.name)
  const lib = { groups: {}, presets: {} }
  expect(describeSelection(names, groups, lib, [...names], null, []).label).toBe('不限制')
  expect(describeSelection(names, groups, lib, ['mine'], null, []).label).toBe('自定义')

  engine(on)
  await start($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'm:tg:p:figma' })
  await ui.press({ key: 'm:tg:p:figma' })
  expect((await ui.find({ key: 'agent:__all' }))?.text).toContain('◉')
  expect(await ui.find({ key: 'save-agent' })).toBe(undefined)
  await ui.unmount()
})

test('before the first turn a group can be turned off, and kept as an Agent', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  expect(await listing($)).toBe(LISTING)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 6 / 6')
  expect(await ui.find({ type: 'Text', text: /发第一条消息前可以改/ })).toBeDefined()
  await ui.press({ key: 'm:tg:p:figma' })
  expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 5 / 6')
  expect(await ui.find({ type: 'Text', text: /和哪个 Agent 都不一样/ })).toBeDefined()

  const filtered = await listing($)
  expect(filtered.includes('figma:figma-use')).toBe(false)
  expect(filtered).toContain('Skill loadout "自定义": 1 more installed skill is not loaded')
  expect((await $.tool.call({ tool: 'Skill', skill: 'figma:figma-use' })).deny).toContain('figma:figma-use')
  expect((await $.tool.call({ tool: 'Skill', skill: 'code-review' })).deny).toBe(undefined)
  await $.prompt.submit({ text: '用 figma:figma-use 看一下这个设计', wait: false, origin: { kind: 'composer' } })
  expect((await $.tool.call({ tool: 'Skill', skill: 'figma:figma-use' })).deny).toBe(undefined)

  // Kept as an Agent, the session now matches it.
  await ui.input({ key: 'save-agent', text: '不要设计' })
  expect(await ui.find({ key: 'save-agent' })).toBe(undefined)
  expect((await ui.find({ key: 'agent:不要设计' }))?.text).toContain('◉')
  await ui.press({ key: 'agent:__all' })
  expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 6 / 6')
  await ui.unmount()
})

test('the first turn locks the loadout; a cleared conversation picks again', async ($, on) => {
  const { store } = engine(on)
  await start($)

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'm:tg:p:figma' })
  await ui.unmount()
  await $.turn.start({ text: '开始吧', turnId: 't1' })

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /已锁定/ }))?.text).toContain('已锁定')
  expect(await ui.find({ key: 'agent:__all' })).toBe(undefined)
  expect(await ui.find({ key: 'm:tg:p:figma' })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /比如/ }))?.text).toContain('figma:figma-use')
  // Agents can still be managed, for the sessions to come.
  await ui.press({ key: 'manage' })
  expect(await ui.find({ type: 'Text', text: /下一个新会话/ })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.unmount()

  // The listing stays as it was locked, and the lock is kept for a resume.
  expect((await listing($)).includes('figma:figma-use')).toBe(false)
  const locks = store.get('locks') as Record<string, { allow: string[] | null; label: string }>
  expect(locks['S1']?.label).toBe('自定义')
  expect(locks['S1']?.allow?.includes('figma:figma-use')).toBe(false)
  const status = await $.tool.call({ tool: 'mcp__skill-loadout__loadout', action: 'status' })
  expect(status.text).toContain('"locked": true')

  // A /clear starts a conversation that picks its own.
  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S1' } })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'agent:__all' })).toBeDefined()
  await ui.unmount()
})

test('a resumed session gets the loadout it was locked with, and is not asked', async ($, on) => {
  const { store, asked } = engine(on, { history: true, files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  store.set('locks', { S1: { allow: ['image-prompt'], agent: null, label: '只要图片', at: 1 } })
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^只要图片$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /已锁定/ })).toBeDefined()
  await ui.unmount()
  const text = await listing($)
  expect(text).toContain('- image-prompt:')
  expect(text.includes('- remotion-render:')).toBe(false)
  await say($, '接着做')
  expect(asked.length).toBe(0)
})

test('a session with history and no lock keeps every skill', async ($, on) => {
  const { store, asked } = engine(on, { history: true, files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^不限制$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /已锁定/ })).toBeDefined()
  await ui.unmount()
  expect(await listing($)).toBe(LISTING)
  expect((store.get('locks') as Record<string, { allow: unknown }>)['S1']?.allow).toBe(null)
  await say($, '接着做')
  expect(asked.length).toBe(0)
})

test('the first message waits while the person picks an Agent on a card', async ($, on) => {
  const fake = engine(on, { answers: ['只要图片'], files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  await start($)
  // The panel does not open on its own: the card asks instead.
  expect(fake.opens()).toBe(0)

  await say($, '帮我出一张海报')
  expect(fake.asked.length).toBe(1)
  expect(fake.asked[0]?.question).toBe('这个会话用哪套技能？')
  expect(fake.asked[0]?.options.map(option => option.label)).toEqual(['只要图片', '设计', '不限制'])
  // Each option says what it holds.
  expect(fake.asked[0]?.options[0]?.description).toBe('图 · 1 个 skill')
  expect(fake.asked[0]?.options[2]?.description).toBe('装全部 6 个 skill')

  const text = await listing($)
  expect(text).toContain('- image-prompt:')
  expect(text.includes('- remotion-render:')).toBe(false)
  await $.turn.start({ text: '帮我出一张海报', turnId: 't1' })
  expect((fake.store.get('locks') as Record<string, { label: string }>)['S1']?.label).toBe('只要图片')
  // Later messages are not asked about.
  await say($, '再来一张')
  expect(fake.asked.length).toBe(1)
})

test('a choice made before the first message is not asked again, and /loadout never asks', async ($, on) => {
  const fake = engine(on, { files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  await start($)
  await say($, '/loadout', { name: 'loadout', args: '' })
  expect(fake.asked.length).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /发第一条消息时会弹卡片问你/ })).toBeDefined()
  await ui.press({ key: 'agent:设计' })
  expect(await ui.find({ type: 'Text', text: /发第一条消息时会弹卡片问你/ })).toBe(undefined)
  await ui.unmount()
  await say($, '看看这个设计')
  expect(fake.asked.length).toBe(0)
  expect(await listing($)).toContain('figma:figma-use')
})

test('a dismissed card lets the message through with what the session has', async ($, on) => {
  const fake = engine(on, { answers: [null], files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  await start($)
  await say($, '你好')
  expect(fake.asked.length).toBe(1)
  expect(fake.toasts.some(text => text.includes('没有选技能装配'))).toBe(true)
  expect(await listing($)).toBe(LISTING)
  await say($, '还在吗')
  expect(fake.asked.length).toBe(1)
})

test('the folder’s last Agent comes first; many Agents come two at a time; a typed name works', async ($, on) => {
  const agents = Object.fromEntries(
    ['甲', '乙', '丙', '丁', 'Coding'].map(name => [name, { groups: [], skills: ['code-review'] }]),
  )
  const fake = engine(on, {
    answers: ['更多 Agent…', '不存在', 'coding'],
    files: { [LIBRARY_PATH]: JSON.stringify({ groups: {}, agents }) },
  })
  fake.store.set('byFolder', { '/work': { preset: '丙', allow: ['code-review'] } })
  await start($)
  await say($, '写代码')

  expect(fake.asked.map(one => one.options.map(option => option.label))).toEqual([
    ['丙', '甲', '更多 Agent…', '不限制'],
    ['乙', '丁', '更多 Agent…', '不限制'],
    ['乙', '丁', '更多 Agent…', '不限制'],
  ])
  expect(fake.asked[0]?.options[0]?.description).toContain('上次在这个文件夹用的')
  expect(fake.asked[2]?.question).toBe('「不存在」不是现成的 Agent，卡片上只能选一个。这个会话用哪套技能？')
  const text = await listing($)
  expect(text).toContain('- code-review:')
  expect(text.includes('- image-prompt:')).toBe(false)
})

test('with the card turned off nothing is asked, the panel opens, and the switch is saved to the file', async ($, on) => {
  const fake = engine(on, { files: { [LIBRARY_PATH]: JSON.stringify({ ...LIBRARY, askOnNewSession: false }) } })
  await start($)
  expect(fake.opens() > 0).toBe(true)
  await say($, '你好')
  expect(fake.asked.length).toBe(0)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'manage' })
  expect(await ui.find({ type: 'Text', text: /关着的时候/ })).toBeDefined()
  await ui.press({ key: 'ask-toggle' })
  expect(await ui.find({ type: 'Text', text: /关着的时候/ })).toBe(undefined)
  await ui.unmount()
  expect(fileOf(fake, LIBRARY_PATH)['askOnNewSession']).toBe(true)
})

test('the library lives in library.json: made from what was stored, read when changed, a broken file kept', async ($, on) => {
  const fake = engine(on)
  fake.store.set('library-v2', { groups: { 图: ['image-*'] }, presets: { 图片: { groups: ['g:图'], skills: [] } } })
  await start($)
  const made = fileOf(fake, LIBRARY_PATH)
  expect(made['version']).toBe(1)
  expect(made['askOnNewSession']).toBe(true)
  expect(made['agents']).toEqual({ 图片: { groups: ['g:图'], skills: [] } })

  // Another tool changes the file: the panel reads it again.
  fake.files.set(
    LIBRARY_PATH,
    JSON.stringify({ groups: { 图: ['image-*'] }, agents: { 图片: { groups: ['图'] }, 新的: { skills: ['code-review'] } } }),
  )
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'manage' })
  expect(await ui.find({ key: 'edit-agent:新的' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.skill-loadout\/library\.json/ })).toBeDefined()

  // A broken file is shown and left alone; the last good copy stays in use until an edit saves over it.
  fake.files.set(LIBRARY_PATH, '{ broken')
  await ui.press({ key: 'back' })
  await ui.press({ key: 'manage' })
  expect(await ui.find({ type: 'Text', text: /文件格式有误/ })).toBeDefined()
  expect(await ui.find({ key: 'edit-agent:新的' })).toBeDefined()
  expect(fake.files.get(LIBRARY_PATH)).toBe('{ broken')
  await ui.input({ key: 'new-group', text: '视频' })
  await ui.unmount()
  const saved = fileOf(fake, LIBRARY_PATH)
  expect(Object.keys(saved['groups'] as object)).toEqual(['图', '视频'])
  expect(Object.keys(saved['agents'] as object)).toEqual(['图片', '新的'])
})

test('the skills Claude Code has are written for other tools', async ($, on) => {
  const fake = engine(on)
  await start($)
  const seen = fileOf(fake, CATALOG_PATH)
  expect(seen['platform']).toBe('claude-code')
  const names = (seen['skills'] as { name: string; lastSeen: number }[]).map(skill => skill.name)
  expect(names).toEqual([...NAMES].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
})

test('an Agent picked before the skills are known is worked out when they are', async ($, on) => {
  const { store } = engine(on)
  store.set('library-v2', { groups: { 图: ['image-*'] }, presets: { 图片: { groups: ['g:图'], skills: [] } } })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'agent:图片' })
  await ui.unmount()
  await $.turn.start({ text: '开始', turnId: 't1' })

  const text = await listing($)
  expect(text).toContain('- image-prompt:')
  expect(text.includes('- remotion-render:')).toBe(false)
  const locks = store.get('locks') as Record<string, { allow: string[] | null }>
  expect(locks['S1']?.allow).toEqual(['image-prompt'])
})

test('a group is made from loose skills only, renamed, and deleted', async ($, on) => {
  const fake = engine(on)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'manage' })
  await ui.input({ key: 'new-group', text: '视频' })
  // The editor offers the loose skills, never a plugin's.
  expect(await ui.find({ key: 'member:image-prompt' })).toBeDefined()
  expect(await ui.find({ key: 'member:figma:figma-use' })).toBe(undefined)
  await ui.press({ key: 'member:image-prompt' })
  await ui.press({ key: 'member:remotion-render' })
  expect(await ui.find({ type: 'Text', text: /成员 2 个/ })).toBeDefined()
  await ui.input({ key: 'group-name:视频', text: '视频素材' })
  expect(await ui.find({ type: 'Text', text: /成员 2 个/ })).toBeDefined()
  await ui.press({ key: 'group-done' })
  expect(await ui.find({ key: 'edit-group:视频素材' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /没归组/ }))?.text).toBe('还有 2 个零碎装的 skill 没归组')
  expect(await ui.find({ type: 'Text', text: /插件和 Claude 自带/ })).toBeDefined()

  // On the main screen the group is ticked whole.
  await ui.press({ key: 'back' })
  expect((await ui.find({ key: 'm:op:g:视频素材' }))?.text).toContain('视频素材')
  await ui.press({ key: 'manage' })
  await ui.press({ key: 'del-group:视频素材' })
  await ui.press({ key: 'del-group:视频素材' })
  expect(await ui.find({ key: 'edit-group:视频素材' })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /没归组/ }))?.text).toBe('还有 4 个零碎装的 skill 没归组')
  await ui.unmount()

  expect(fileOf(fake, LIBRARY_PATH)['groups']).toEqual({})
})

test('an Agent is made and edited in its own editor, and the session follows when asked', async ($, on) => {
  engine(on)
  await start($)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'manage' })
  await ui.press({ key: 'new-agent' })
  await ui.input({ key: 'agent-name:', text: '设计', kind: 'change' })
  await ui.press({ key: 'a:tg:p:figma' })
  expect((await ui.find({ type: 'Text', text: /已选/ }))?.text).toBe('已选 1 个（含 0 个常驻）')
  await ui.press({ key: 'agent-save' })
  expect(await ui.find({ key: 'edit-agent:设计' })).toBeDefined()

  await ui.press({ key: 'back' })
  await ui.press({ key: 'agent:设计' })
  expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 1 / 6')
  expect(await listing($)).toContain('figma:figma-use')
  expect((await listing($)).includes('code-review')).toBe(false)

  // Editing the Agent in use leaves the session as it was until it is applied again.
  await ui.press({ key: 'manage' })
  await ui.press({ key: 'edit-agent:设计' })
  await ui.press({ key: 'a:tg:p:anthropic-skills' })
  await ui.press({ key: 'agent-save' })
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: /在「设计」基础上改过/ })).toBeDefined()
  await ui.press({ key: 'agent:设计' })
  expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 2 / 6')
  expect(await ui.find({ key: 'update-agent' })).toBe(undefined)

  await ui.press({ key: 'manage' })
  await ui.press({ key: 'del-agent:设计' })
  expect(await ui.find({ key: 'edit-agent:设计' })).toBeDefined()
  await ui.press({ key: 'del-agent:设计' })
  expect(await ui.find({ key: 'edit-agent:设计' })).toBe(undefined)
  await ui.unmount()
})

test('every screen draws on every surface, locked or not', async ($, on) => {
  engine(on)
  await start($)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /已装配/ }))?.text).toContain('已装配 6 / 6')
    await ui.press({ key: 'manage' })
    expect(await ui.find({ type: 'Text', text: /插件和 Claude 自带/ })).toBeDefined()
    await ui.press({ key: 'new-agent' })
    expect(await ui.find({ key: 'agent-save' })).toBeDefined()
    await ui.press({ key: 'agent-cancel' })
    await ui.press({ key: 'back' })
    await ui.unmount()
  }

  await $.turn.start({ text: '开始', turnId: 't1' })
  // Which groups are open is the session's, so it is opened once and seen on every surface.
  const first = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await first.press({ key: 'l:op:p:figma' })
  await first.unmount()
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /已锁定/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /figma:figma-use/ })).toBeDefined()
    await ui.unmount()
  }
})

test('an answer picks its option however the host words it; a subagent prompt names its set on a line', () => {
  const offered = ['只要图片', '设计', '不限制']
  const agents = ['只要图片', '设计']
  expect(pickOption('设计', offered, agents)).toBe('设计')
  expect(pickOption('"这个会话用哪套技能？"="设计"', offered, agents)).toBe('设计')
  expect(pickOption('只要图片 - 图 · 1 个 skill', offered, agents)).toBe('只要图片')
  expect(pickOption('设计，不过不要别的', offered, agents)).toBe('设计')
  expect(pickOption('ALL', offered, agents)).toBe('不限制')
  expect(pickOption('随便', offered, agents)).toBe(null)
  expect(markerName('做一张海报\n技能装配：只要图片\n')).toBe('只要图片')
  expect(markerName('Skill loadout: 「设计」')).toBe('设计')
  expect(markerName('没有指定')).toBe(null)
})

test('the main agent names a subagent’s skills in its prompt; others and forks keep the session’s', async ($, on) => {
  const fake = engine(on, { answers: ['设计'], files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) } })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  // The conversation's first listing tells the model how to name a subagent's skills.
  const first = await listing($)
  expect(first).toContain('技能装配：<set name>')
  expect(first).toContain('只要图片 (图)')
  expect((await listing($)).includes('技能装配')).toBe(false)
  await say($, '做个海报')
  await $.turn.start({ text: '做个海报', turnId: 't1' })

  await spawn($, { prompt: '找几张参考图\n技能装配：只要图片', description: '找参考图', subagentType: 'general-purpose' })
  await spawn($, { prompt: '看看设计稿', description: '看设计稿', subagentType: 'general-purpose' })
  await spawn($, { prompt: '换个思路\n技能装配：只要图片', description: '分叉', subagentType: 'fork' })

  // Its own set: the listing it gets, the note in its task, and the guard.
  const own = await listingOf($, 'A1')
  expect(own).toContain('- image-prompt:')
  expect(own.includes('figma:figma-use')).toBe(false)
  expect(own).toContain('Skill loadout "只要图片": 5 more installed skills are not loaded for this subagent')
  expect(fake.spawned[0]?.prompt).toContain('(Skill loadout "只要图片" for this task — skills you may use: image-prompt.')
  const denied = (await $.tool.call({ tool: 'Skill', skill: 'figma:figma-use', agentId: 'A1' } as never)) as { deny?: string }
  expect(denied.deny).toContain('不在这个子代理')
  // No line, or a fork: the session's set, and the task as it was.
  expect(await listingOf($, 'A2')).toContain('figma:figma-use')
  expect((await listingOf($, 'A2')).includes('- image-prompt:')).toBe(false)
  expect(fake.spawned[1]?.prompt).toBe('看看设计稿')
  expect(await listingOf($, 'A3')).toContain('figma:figma-use')
  expect(fake.spawned[2]?.prompt).toBe('换个思路\n技能装配：只要图片')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /只要图片 · 主代理选的/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /设计 · 沿用上级/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /设计 · fork，沿用上级/ })).toBeDefined()
  await ui.unmount()

  // A cleared conversation's first listing tells the model again.
  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S1' } })
  expect(await listing($)).toContain('技能装配：<set name>')
})

test('when the person picks, a card asks for each subagent, the main agent’s suggestion first', async ($, on) => {
  const fake = engine(on, {
    answers: ['设计', '只要图片'],
    files: { [LIBRARY_PATH]: JSON.stringify({ ...LIBRARY, subagentPicker: 'person' }) },
  })
  await start($)
  await say($, '做个海报')
  await $.turn.start({ text: '做个海报', turnId: 't1' })
  await spawn($, { prompt: '找参考图\n技能装配：只要图片', description: '找参考图', subagentType: 'general-purpose' })

  expect(fake.asked[1]?.question).toBe('子代理「找参考图」用哪套技能？')
  expect(fake.asked[1]?.options.map(option => option.label)).toEqual(['只要图片', '设计', '不限制', '和主会话一样'])
  expect(fake.asked[1]?.options[0]?.description).toContain('主代理建议')
  expect(fake.asked[1]?.options[3]?.description).toBe('沿用「设计」')
  expect((await listingOf($, 'A1')).includes('figma:figma-use')).toBe(false)
  // A fork is never asked about.
  await spawn($, { prompt: '换个思路', description: '分叉', subagentType: 'fork' })
  expect(fake.asked.length).toBe(2)
})

test('a subagent whose first listing comes before its spawn settles still gets its own set', async ($, on) => {
  const fake = engine(on, {
    answers: ['设计'],
    files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) },
    agents: [
      { id: 'A1', description: '找参考图', type: 'general-purpose' },
      { id: 'X1', description: '没见过', type: 'general-purpose', parentId: 'A1' },
    ],
    hold: true,
  })
  await start($)
  await say($, '做个海报')
  await $.turn.start({ text: '做个海报', turnId: 't1' })
  const spawning = spawn($, { prompt: '技能装配：只要图片', description: '找参考图', subagentType: 'general-purpose' })
  // The spawn has settled the set and waits for the engine's answer when the subagent's first request goes out.
  for (let tries = 0; tries < 2000 && fake.arrived() === 0; tries += 1) await Promise.resolve()
  expect(fake.arrived()).toBe(1)
  const early = await listingOf($, 'A1')
  fake.release()
  await spawning

  expect(early).toContain('- image-prompt:')
  expect(early.includes('figma:figma-use')).toBe(false)
  expect(fake.spawned[0]?.agentId).toBe('A1')
  // One spawned under it that this plugin never saw keeps its parent's set.
  const unseen = await listingOf($, 'X1')
  expect(unseen).toContain('- image-prompt:')
  expect(unseen.includes('figma:figma-use')).toBe(false)
})

test('a forked session, which copies the replies word for word, takes the lock of the session it came from', async ($, on) => {
  const reply1 = '你好！我是 Claude Code，正在 my-app 这个项目里待命，有什么要做的？'
  const reply3 = '你好！这里是 Claude Code，今天想先看哪部分：进度、测试，还是设计文档？'
  let session = 'S1'
  let rows: Row[] = []
  const fake = engine(on, {
    answers: ['只要图片', '设计'],
    files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) },
    sessionId: () => session,
    rows: () => rows,
  })
  /** The model's reply (or an error written in its place), stored as the conversation's row. */
  const replies = async (text: string, model = 'test-model'): Promise<void> => {
    await $.session.append({
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text }] },
      door: 'response',
      origin: { kind: 'model', model },
      uuid: `r-${text.length}`,
    })
  }
  await start($)
  await say($, '你好')
  await $.turn.start({ text: '你好', turnId: 't1' })
  await replies(reply1)
  // A short reply is no mark, nor an error in the model's place: another conversation may have it word for word.
  await replies('好的')
  await replies('Failed to authenticate: OAuth session expired and could not be refreshed', '<synthetic>')
  const locks = (): Record<string, { label: string; anchors?: string[] }> =>
    fake.store.get('locks') as Record<string, { label: string; anchors?: string[] }>
  expect(locks()['S1']?.anchors).toEqual([promptMark(reply1)])

  // Another session in the folder that also starts with 你好, and picks another set.
  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S3' } })
  session = 'S3'
  await say($, '你好')
  await $.turn.start({ text: '你好', turnId: 't9' })
  await replies(reply3)
  expect(locks()['S3']?.label).toBe('设计')

  // The app forks S1 into a new session in a new process: S1's rows as they were, then more of its own.
  await $.session.end({ reason: 'resume', sessionId: 'S3', resume: { id: 'S2' } })
  session = 'S2'
  rows = [
    { role: 'user', text: '你好', toolUses: [], uuid: 'u1' },
    { role: 'assistant', text: reply1, toolUses: [], uuid: 'a1' },
  ]
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  expect(locks()['S2']?.label).toBe('只要图片')
  expect((fake.store.get('diag') as Record<string, unknown>)['loadout']).toBe('locked (forked: 只要图片)')
  const text = await listing($)
  expect(text).toContain('- image-prompt:')
  expect(text.includes('figma:figma-use')).toBe(false)
  // The fork is not asked: only S1 and S3 were.
  await say($, '接着做')
  expect(fake.asked.length).toBe(2)
})

test('a message names one set as a word or in its own script; several or none name nothing', () => {
  expect(setNamedIn('开一个子代理，用 Coding 那套技能，帮我列一下文件', ['视频制作', 'Coding'])).toBe('Coding')
  expect(setNamedIn('用视频制作那套', ['视频制作', 'Coding'])).toBe('视频制作')
  expect(setNamedIn('decoding this file', ['Coding'])).toBe(null)
  expect(setNamedIn('用 Coding Pro 那套', ['Coding', 'Coding Pro'])).toBe('Coding Pro')
  expect(setNamedIn('视频制作和 Coding 都要', ['视频制作', 'Coding'])).toBe(null)
})

test('a set the person names for the work goes to a subagent started with no line, and the main agent is told', async ($, on) => {
  engine(on, {
    answers: ['设计'],
    files: { [LIBRARY_PATH]: JSON.stringify(LIBRARY) },
    onAgent: call => spawn($, call),
  })
  await start($)
  await say($, '开一个子代理，用只要图片那套技能，帮我找几张参考图')
  await $.turn.start({ text: '开一个子代理', turnId: 't1' })
  const result = (await $.tool.call({
    tool: 'Agent',
    description: '找参考图',
    prompt: '帮我找几张参考图',
    subagent_type: 'general-purpose',
  } as never)) as { context?: readonly string[] }

  const own = await listingOf($, 'A1')
  expect(own).toContain('- image-prompt:')
  expect(own.includes('figma:figma-use')).toBe(false)
  expect(result.context?.join('\n')).toContain('skill set "只要图片" (1 skill), as the user chose')
})
