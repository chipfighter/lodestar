import { useEffect, useState } from 'react'

import {
  Badge,
  Body1,
  Button,
  Caption1,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Subtitle2,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { Add20Regular, Delete20Regular, LockClosed16Regular } from '@fluentui/react-icons'

import { MAX_NAME, isLoose, type Group } from '@shared/listing'
import { formatTokens, type Model } from '../data/model'
import { NameTakenError, type Actions, type DataState } from '../data/useData'
import { useStrings, type Strings } from '../i18n'
import { GroupTag, PageHeader, groupTitle, useNotify } from '../ui/common'

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  split: { display: 'flex', gap: '16px', flexGrow: 1, minHeight: 0, padding: '0 32px 24px' },
  listPane: { width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', minHeight: 0 },
  sectionLabel: { padding: '10px 12px 4px', color: tokens.colorNeutralForeground3 },
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px 8px 16px',
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    textAlign: 'left',
    font: 'inherit',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
  },
  itemSelected: {
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
    '::before': {
      content: '""',
      position: 'absolute',
      left: '4px',
      top: '10px',
      bottom: '10px',
      width: '3px',
      borderRadius: '2px',
      backgroundColor: tokens.colorBrandForeground1,
    },
  },
  itemName: { flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemCount: { color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  lock: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  create: { padding: '4px 4px 8px 8px' },
  detail: {
    flexGrow: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    minHeight: 0,
  },
  detailHead: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '18px 20px 14px', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  titleRow: { display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' },
  nameField: { flexGrow: 1, minWidth: '200px', maxWidth: '360px' },
  heading: { display: 'flex', alignItems: 'center', gap: '8px' },
  meta: { color: tokens.colorNeutralForeground3 },
  rows: { overflowY: 'auto', padding: '6px 0 12px', minHeight: 0 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'start',
    columnGap: '8px',
    padding: '6px 20px',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  rowPlain: { gridTemplateColumns: 'minmax(0, 1fr) auto', padding: '8px 20px' },
  rowText: { display: 'flex', flexDirection: 'column', minWidth: 0, padding: '5px 0' },
  name: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  description: { color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  side: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', padding: '6px 0', maxWidth: '240px' },
  used: { color: tokens.colorNeutralForeground3, textAlign: 'right' },
  placeholder: { margin: 'auto', color: tokens.colorNeutralForeground3, padding: '24px', textAlign: 'center' },
})

/** The Agents that pick a whole group by its id. */
function agentsUsing(state: DataState, id: string): string[] {
  return Object.entries(state.value.library.presets)
    .filter(([, preset]) => preset.groups.includes(id))
    .map(([name]) => name)
}

function cleanName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME)
}

export function GroupsPage({ state, actions, model }: { state: DataState; actions: Actions; model: Model }) {
  const styles = useStyles()
  const strings = useStrings()
  const t = strings.groups
  const notify = useNotify()
  const [selectedId, setSelectedId] = useState<string | null>(() => model.groups[0]?.id ?? null)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<Group | null>(null)

  const mine = model.groups.filter(group => group.kind === 'custom')
  const ungrouped = model.groups.find(group => group.kind === 'ungrouped')
  const fixed = model.groups.filter(group => group.kind === 'fixed')
  const selected = model.groups.find(group => group.id === selectedId) ?? null

  // A group renamed or deleted elsewhere: show the first one instead.
  useEffect(() => {
    if (selectedId !== null && !model.groups.some(group => group.id === selectedId)) setSelectedId(model.groups[0]?.id ?? null)
  }, [model.groups, selectedId])

  const create = async (): Promise<void> => {
    const name = cleanName(newName)
    if (name === '') return
    if (name in state.value.library.groups) {
      setCreateError(t.taken(name))
      return
    }
    try {
      await actions.createGroup(name)
      notify(t.created(name))
      setNewName('')
      setCreateError(undefined)
      setSelectedId(`g:${name}`)
    } catch (error) {
      if (error instanceof NameTakenError) setCreateError(t.taken(name))
      else notify(String(error), 'error')
    }
  }

  const remove = async (group: Group): Promise<void> => {
    setDeleting(null)
    try {
      await actions.deleteGroup(group.label, group.names)
      notify(t.deleted(group.label))
    } catch (error) {
      notify(String(error), 'error')
    }
  }

  const item = (group: Group, isLocked = false) => (
    <button
      key={group.id}
      type="button"
      className={mergeClasses(styles.item, selectedId === group.id && styles.itemSelected)}
      aria-current={selectedId === group.id}
      onClick={() => setSelectedId(group.id)}
    >
      {isLocked ? <LockClosed16Regular className={styles.lock} /> : null}
      <Body1 className={styles.itemName}>{groupTitle(group, strings)}</Body1>
      <Caption1 className={styles.itemCount}>{group.names.length}</Caption1>
    </button>
  )

  return (
    <div className={styles.page}>
      <PageHeader title={t.title} intro={t.intro} />
      <div className={styles.split}>
        <nav className={styles.listPane} aria-label={t.title}>
          <Caption1 className={styles.sectionLabel}>{t.mine}</Caption1>
          {mine.map(group => item(group))}
          <div className={styles.create}>
            <Field validationState={createError === undefined ? 'none' : 'error'} validationMessage={createError}>
              <Input
                size="small"
                value={newName}
                placeholder={t.createPlaceholder}
                maxLength={MAX_NAME}
                contentBefore={<Add20Regular />}
                aria-label={t.create}
                onChange={(_, data) => {
                  setNewName(data.value)
                  setCreateError(undefined)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') void create()
                }}
              />
            </Field>
          </div>
          {ungrouped === undefined ? null : item(ungrouped)}
          {fixed.length > 0 ? <Caption1 className={styles.sectionLabel}>{t.fixed}</Caption1> : null}
          {fixed.map(group => item(group, true))}
        </nav>

        <div className={styles.detail}>
          {selected === null ? (
            <Body1 className={styles.placeholder}>{t.pickOne}</Body1>
          ) : selected.kind === 'custom' ? (
            <CustomGroup
              key={selected.id}
              group={selected}
              state={state}
              actions={actions}
              model={model}
              strings={strings}
              onRenamed={to => setSelectedId(`g:${to}`)}
              onDelete={() => setDeleting(selected)}
            />
          ) : (
            <ReadOnlyGroup key={selected.id} group={selected} state={state} model={model} strings={strings} />
          )}
        </div>
      </div>

      <Dialog open={deleting !== null} onOpenChange={(_, data) => !data.open && setDeleting(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{deleting === null ? '' : t.deleteTitle(deleting.label)}</DialogTitle>
            <DialogContent>{t.deleteBody}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleting(null)}>
                {strings.cancel}
              </Button>
              <Button appearance="primary" onClick={() => deleting !== null && void remove(deleting)}>
                {strings.delete}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}

/** A group of the person's: rename it, delete it, and tick which loose skills it holds. */
function CustomGroup({
  group,
  state,
  actions,
  model,
  strings,
  onRenamed,
  onDelete,
}: {
  group: Group
  state: DataState
  actions: Actions
  model: Model
  strings: Strings
  onRenamed: (to: string) => void
  onDelete: () => void
}) {
  const styles = useStyles()
  const t = strings.groups
  const notify = useNotify()
  const [name, setName] = useState(group.label)
  const [nameError, setNameError] = useState<string | undefined>()
  const loose = model.skills.filter(isLoose)
  const users = agentsUsing(state, group.id)

  const rename = async (): Promise<void> => {
    const to = cleanName(name)
    if (to === '' || to === group.label) {
      setName(group.label)
      return
    }
    try {
      await actions.renameGroup(group.label, to)
      notify(t.renamed(to))
      onRenamed(to)
    } catch (error) {
      if (error instanceof NameTakenError) setNameError(t.taken(to))
      else notify(String(error), 'error')
    }
  }

  return (
    <>
      <div className={styles.detailHead}>
        <div className={styles.titleRow}>
          <Field
            className={styles.nameField}
            label={t.name}
            validationState={nameError === undefined ? 'none' : 'error'}
            validationMessage={nameError}
          >
            <Input
              value={name}
              maxLength={MAX_NAME}
              onChange={(_, data) => {
                setName(data.value)
                setNameError(undefined)
              }}
              onBlur={() => void rename()}
              onKeyDown={event => {
                if (event.key === 'Enter') void rename()
              }}
            />
          </Field>
          <Button appearance="subtle" icon={<Delete20Regular />} onClick={onDelete}>
            {strings.delete}
          </Button>
        </div>
        <Caption1 className={styles.meta}>
          {t.members(group.names.length)} · {users.length > 0 ? t.usedBy(users.join(strings.listSep)) : t.unused}
        </Caption1>
        <Caption1 className={styles.meta}>{t.pick}</Caption1>
      </div>
      <div className={styles.rows}>
        {loose.length === 0 ? (
          <Body1 className={styles.placeholder}>{t.noLoose}</Body1>
        ) : (
          loose.map(skill => {
            const isIn = group.names.includes(skill.name)
            const other = model.groupOf.get(skill.name)
            const elsewhere = !isIn && other !== undefined && other.kind === 'custom' ? other.label : null
            return (
              <div key={skill.name} className={styles.row}>
                <Checkbox
                  checked={isIn}
                  aria-label={skill.name}
                  onChange={(_, data) => void actions.setGroupMember(group.label, skill.name, data.checked === true)}
                />
                <div className={styles.rowText}>
                  <span className={styles.name}>{skill.name}</span>
                  {skill.description ? (
                    <Caption1 className={styles.description} title={skill.description}>
                      {skill.description}
                    </Caption1>
                  ) : null}
                </div>
                <div className={styles.side}>
                  {elsewhere === null ? null : (
                    <Badge appearance="outline" color="informative" size="small">
                      {t.inOther(elsewhere)}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

/** A group that came as it is (a plugin's, Claude's own) or the loose skills in no group: shown, not changed. */
function ReadOnlyGroup({ group, state, model, strings }: { group: Group; state: DataState; model: Model; strings: Strings }) {
  const styles = useStyles()
  const t = strings.groups
  const users = agentsUsing(state, group.id)
  const total = group.names.reduce((sum, name) => sum + (model.byName.get(name)?.tokens ?? 0), 0)

  return (
    <>
      <div className={styles.detailHead}>
        <div className={styles.heading}>
          <Subtitle2>{groupTitle(group, strings)}</Subtitle2>
          <GroupTag group={group} strings={strings} />
        </div>
        <Caption1 className={styles.meta}>
          {t.members(group.names.length)} · {strings.tokens(formatTokens(total))}
          {group.kind === 'fixed' ? ` · ${users.length > 0 ? t.usedBy(users.join(strings.listSep)) : t.unused}` : ''}
        </Caption1>
        <Caption1 className={styles.meta}>{group.kind === 'ungrouped' ? t.ungroupedHint : t.readOnly}</Caption1>
      </div>
      <div className={styles.rows}>
        {group.names.map(name => {
          const skill = model.byName.get(name)
          const usedBy = model.usedBy.get(name) ?? []
          const isAlways = model.always.has(name)
          return (
            <div key={name} className={mergeClasses(styles.row, styles.rowPlain)}>
              <div className={styles.rowText}>
                <span className={styles.name} title={name}>
                  {group.id.startsWith('p:') && name.includes(':') ? name.slice(name.indexOf(':') + 1) : name}
                </span>
                {skill?.description ? (
                  <Caption1 className={styles.description} title={skill.description}>
                    {skill.description}
                  </Caption1>
                ) : null}
              </div>
              <div className={styles.side}>
                {isAlways ? (
                  <Tooltip content={strings.alwaysOnHint} relationship="description">
                    <Badge appearance="outline" color="subtle" size="small">
                      {strings.kind.alwaysOn}
                    </Badge>
                  </Tooltip>
                ) : (
                  <Caption1 className={styles.used}>{usedBy.length > 0 ? usedBy.join(strings.listSep) : '—'}</Caption1>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
