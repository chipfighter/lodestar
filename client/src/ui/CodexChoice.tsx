// Which of Codex's own Agents new Codex sessions use. Codex can't ask at a session's first message,
// so the choice is made here, before a session starts, and counts for every new one until changed.

import { useMemo, useState } from 'react'

import { Body1Strong, Caption1, Dropdown, Option, Spinner, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'

import { loadedOf, platformModel, presetSkills } from '../data/model'
import type { Actions, DataState } from '../data/useData'
import { useStrings } from '../i18n'
import { useNotify } from './common'
import { PlatformLogo } from './platform'

/** The option for every skill: no Agent can be called this, since names can't hold control characters. */
const NO_LIMIT = '\u0000no-limit'

export type CodexChoiceState = {
  /** The Agent new Codex sessions use; null for every skill. */
  agent: string | null
  /** Codex's own Agents, as the dropdown offers them. */
  agents: string[]
  /** The Agent Codex uses was deleted, and its switches are still in place. */
  isGone: boolean
  /** What new sessions see, in words. */
  status: string
  isApplying: boolean
  choose(agent: string | null): void
}

/** What the Codex dropdown shows and does, for the Agents page and the settings alike. */
export function useCodexChoice(state: DataState, actions: Actions): CodexChoiceState {
  const strings = useStrings()
  const t = strings.codex
  const notify = useNotify()
  const [isApplying, setIsApplying] = useState(false)
  const { value, codex } = state
  // The model reads only these parts of the state.
  const model = useMemo(() => platformModel(state, 'codex'), [value, codex.catalog, codex.off, codex.record])
  const agent = codex.record?.agent ?? null
  const preset = agent === null ? undefined : model.library.presets[agent]
  // Skills the person switched off in Codex stay off whatever the Agent.
  const seen = (names: Iterable<string>): number => [...names].filter(name => !model.off.has(name)).length
  const total = seen(model.names)
  const status =
    agent === null ? t.seeAll(total) : preset === undefined ? t.gone(agent) : t.seeSome(seen(loadedOf(model, presetSkills(model, preset))), total)

  const choose = (next: string | null): void => {
    if (next === agent && preset !== undefined) return
    setIsApplying(true)
    void actions
      .useForCodex(next)
      .then(
        off => notify(next === null ? t.setAllDone : strings.agents.codexDone(next, off)),
        error => notify(t.failed(String(error instanceof Error ? error.message : error)), 'error'),
      )
      .finally(() => setIsApplying(false))
  }

  return { agent, agents: Object.keys(model.library.presets), isGone: agent !== null && preset === undefined, status, isApplying, choose }
}

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    flexShrink: 0,
    margin: '0 32px 12px',
    padding: '8px 14px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
  },
  dropdown: { minWidth: '200px' },
  status: { color: tokens.colorNeutralForeground3 },
  gone: { color: tokens.colorStatusWarningForeground1 },
  picked: { display: 'flex', alignItems: 'center', gap: '8px' },
})

/** The dropdown alone: every skill, or one of Codex's Agents; a pick counts at once. */
export function CodexDropdown({ choice, label }: { choice: CodexChoiceState; label: string }) {
  const styles = useStyles()
  const t = useStrings().codex
  const shown = choice.agent === null ? t.noLimit : choice.isGone ? t.goneOption(choice.agent) : choice.agent

  return (
    <span className={styles.picked}>
      <Dropdown
        className={styles.dropdown}
        aria-label={label}
        value={shown}
        selectedOptions={[choice.agent ?? NO_LIMIT]}
        disabled={choice.isApplying}
        onOptionSelect={(_, data) => choice.choose(data.optionValue === NO_LIMIT || data.optionValue === undefined ? null : data.optionValue)}
      >
        <Option value={NO_LIMIT}>{t.noLimit}</Option>
        {choice.agents.map(name => (
          <Option key={name} value={name}>
            {name}
          </Option>
        ))}
        {choice.isGone && choice.agent !== null ? (
          <Option value={choice.agent} disabled>
            {t.goneOption(choice.agent)}
          </Option>
        ) : null}
      </Dropdown>
      {choice.isApplying ? <Spinner size="tiny" /> : null}
    </span>
  )
}

/** The bar over Codex's Agents: which one new Codex sessions use, and what they see with it. */
export function CodexChoice({ state, actions }: { state: DataState; actions: Actions }) {
  const styles = useStyles()
  const t = useStrings().codex
  const choice = useCodexChoice(state, actions)

  return (
    <div className={styles.bar}>
      <PlatformLogo platform="codex" size={20} />
      <Body1Strong>{t.label}</Body1Strong>
      <CodexDropdown choice={choice} label={t.label} />
      <Caption1 className={mergeClasses(styles.status, choice.isGone && styles.gone)}>
        {choice.isGone ? choice.status : `${choice.status} · ${t.openKeep}`}
      </Caption1>
    </div>
  )
}
