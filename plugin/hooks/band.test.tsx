import { expect, test } from 'claude-code/testing'

const LISTING = [
  'The following skills are available for use with the Skill tool:',
  '',
  '- image-prompt: 把画面想法转成摄影提示词。',
  '- code-review: Review the current diff',
].join('\n')

const BAND = {
  plugin: 'skill-loadout',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 4,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 4 },
    view: {},
  },
} as const

test('the bar above the prompt shows while the panel is not open, and brings it back', async ($, on) => {
  // The app may not place the panel at first, as when its window is not ready.
  let isPlaced = false
  let opens = 0
  on('clock.now', () => ({ value: 0 }))
  on('clock.sleep', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'S1' }))
  on('session.turns', () => ({ value: 0 }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'loadout' } }))
  on('ui.open', () => {
    opens += 1
    return { value: isPlaced ? { isPlaced: true } : { isPlaced: false, reason: 'window not ready' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.attachment', (_, e) => ({ text: e.text }))
  // Stands for what the engine draws in the band when the plugin steps aside.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.prompt.attachment({ type: 'skill_listing', text: LISTING, origin: { kind: 'engine' } })
  // The first message asks on a card, so the panel does not open on its own.
  expect(opens).toBe(0)

  // Nothing says which language the person uses yet (no setting, no message, no earlier session): English.
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /\// }))?.text).toBe('2/2')
    expect(await ui.find({ type: 'Text', text: /asks at the first message/ })).toBeDefined()
    expect(await ui.find({ key: 'band:open' })).toBeDefined()
    await ui.unmount()
  }

  // A press is the person's own ask; while the app does not place the panel, the bar stays.
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'band:open' })
  expect(opens).toBe(1)
  expect(await ui.find({ key: 'band:open' })).toBeDefined()
  // Once the app places it, the bar steps aside.
  isPlaced = true
  await ui.press({ key: 'band:open' })
  expect(opens).toBe(2)
  expect(await ui.find({ key: 'band:open' })).toBe(undefined)
  await ui.unmount()
})
