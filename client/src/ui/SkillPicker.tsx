import { useMemo, useState } from 'react'

import { Badge, Body1, Body1Strong, Caption1, Checkbox, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons'

import type { Group } from '@shared/listing'
import { formatTokens, matchesSearch, tokensOf, type Model } from '../data/model'
import { useStrings } from '../i18n'
import { GroupTag, groupTitle } from './common'

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0 16px' },
  group: {
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px 4px 4px',
    minHeight: '40px',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  expander: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexGrow: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    padding: '0',
    border: 'none',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  chevron: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  groupName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { marginLeft: 'auto', color: tokens.colorNeutralForeground3, flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
  skills: { borderTop: `1px solid ${tokens.colorNeutralStroke3}`, padding: '4px 0' },
  skill: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'start',
    columnGap: '4px',
    padding: '2px 14px 2px 30px',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  skillText: { display: 'flex', flexDirection: 'column', minWidth: 0, padding: '6px 0' },
  skillName: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  nameText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase300 },
  description: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tokens: { color: tokens.colorNeutralForeground4, padding: '8px 0 0 8px', fontVariantNumeric: 'tabular-nums' },
  dim: { opacity: 0.85 },
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
})

type Props = {
  model: Model
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
  query: string
  isOnlySelected: boolean
}

/** Groups and their skills with checkboxes: a group's box ticks all of it; always-on skills stay ticked. */
export function SkillPicker({ model, selected, onChange, query, isOnlySelected }: Props) {
  const styles = useStyles()
  const strings = useStrings()
  // Groups part-picked open by themselves; the person opens and closes the rest.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  const isFiltering = query.trim() !== '' || isOnlySelected

  const shown = useMemo(
    () =>
      model.groups
        .filter(group => group.names.length > 0)
        .map(group => ({
          group,
          names: group.names.filter(name => {
            const skill = model.byName.get(name)
            if (skill === undefined || !matchesSearch(skill, query)) return false
            return !isOnlySelected || selected.has(name) || model.always.has(name)
          }),
        }))
        .filter(one => !isFiltering || one.names.length > 0),
    [model, query, isOnlySelected, selected, isFiltering],
  )

  if (model.names.length === 0) return <Body1 className={styles.empty}>{strings.agents.noSkills}</Body1>
  if (shown.length === 0) return <Body1 className={styles.empty}>{strings.agents.noMatch}</Body1>

  const toggleOpen = (id: string): void =>
    setToggled(old => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const setMany = (names: readonly string[], isOn: boolean): void => {
    const next = new Set(selected)
    for (const name of names) {
      if (model.always.has(name)) continue
      if (isOn) next.add(name)
      else next.delete(name)
    }
    onChange(next)
  }

  return (
    <div className={styles.list}>
      {shown.map(({ group, names }) => {
        const own = group.names.filter(name => !model.always.has(name))
        const picked = own.filter(name => selected.has(name)).length
        const state: boolean | 'mixed' = picked === 0 ? false : picked === own.length ? true : 'mixed'
        const loaded = group.names.filter(name => selected.has(name) || model.always.has(name))
        const isOpenByDefault = isFiltering || state === 'mixed'
        const isOpen = toggled.has(group.id) ? !isOpenByDefault : isOpenByDefault
        const title = groupTitle(group, strings)

        return (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <Checkbox
                checked={state}
                disabled={own.length === 0}
                aria-label={title}
                onChange={(_, data) => setMany(own, data.checked === true)}
              />
              <button type="button" className={styles.expander} aria-expanded={isOpen} onClick={() => toggleOpen(group.id)}>
                {isOpen ? <ChevronDown16Regular className={styles.chevron} /> : <ChevronRight16Regular className={styles.chevron} />}
                <Body1Strong className={styles.groupName}>{title}</Body1Strong>
                <GroupTag group={group} strings={strings} />
                <Caption1 className={styles.count}>
                  {strings.ofTotal(loaded.length, group.names.length)}
                  {loaded.length > 0 ? ` · ${strings.tokens(formatTokens(tokensOf(model, loaded)))}` : ''}
                </Caption1>
              </button>
            </div>
            {isOpen ? <GroupSkills group={group} names={names} model={model} selected={selected} onSet={setMany} /> : null}
          </div>
        )
      })}
    </div>
  )
}

function GroupSkills({
  group,
  names,
  model,
  selected,
  onSet,
}: {
  group: Group
  names: readonly string[]
  model: Model
  selected: ReadonlySet<string>
  onSet: (names: readonly string[], isOn: boolean) => void
}) {
  const styles = useStyles()
  const strings = useStrings()

  return (
    <div className={styles.skills} role="group" aria-label={groupTitle(group, strings)}>
      {names.map(name => {
        const skill = model.byName.get(name)
        const isAlways = model.always.has(name)
        const isOn = isAlways || selected.has(name)
        // A plugin's skills show their own name; the plugin is the group.
        const shownName = group.id.startsWith('p:') && name.includes(':') ? name.slice(name.indexOf(':') + 1) : name

        return (
          <div key={name} className={mergeClasses(styles.skill, isAlways && styles.dim)}>
            <Checkbox checked={isOn} disabled={isAlways} aria-label={name} onChange={(_, data) => onSet([name], data.checked === true)} />
            <div className={styles.skillText}>
              <div className={styles.skillName}>
                <span className={styles.nameText} title={name}>
                  {shownName}
                </span>
                {isAlways ? (
                  <Tooltip content={strings.alwaysOnHint} relationship="description">
                    <Badge appearance="outline" color="subtle" size="small">
                      {strings.kind.alwaysOn}
                    </Badge>
                  </Tooltip>
                ) : null}
              </div>
              {skill?.description ? (
                <Caption1 className={styles.description} title={skill.description}>
                  {skill.description}
                </Caption1>
              ) : null}
            </div>
            <Caption1 className={styles.tokens} title={skill?.tokens ? strings.tokens(String(skill.tokens)) : undefined}>
              {skill?.tokens ? formatTokens(skill.tokens) : ''}
            </Caption1>
          </div>
        )
      })}
    </div>
  )
}
