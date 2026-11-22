import { useEffect, useState } from 'react'

import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  SearchBox,
  Switch,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { Add20Regular, Copy20Regular, Delete20Regular, MoreHorizontal20Regular, Rocket20Regular, Save20Regular } from '@fluentui/react-icons'

import { MAX_NAME, RESERVED_NAMES } from '@shared/listing'
import type { Preset } from '../../../plugin/types'
import {
  changesFrom,
  copyName,
  formatTokens,
  loadedOf,
  presetSkills,
  sameSet,
  selectionPreset,
  tokensOf,
  type Model,
} from '../data/model'
import { NameTakenError, type Actions, type DataState } from '../data/useData'
import { timeLeft, useStrings } from '../i18n'
import { PageHeader, useNotify } from '../ui/common'
import { SkillPicker } from '../ui/SkillPicker'

type Draft = {
  /** The Agent being edited as saved; null for one not saved yet. */
  original: string | null
  name: string
  selected: Set<string>
  /** The skills as saved, which an edit is told apart from. */
  base: Set<string>
}

function draftOf(model: Model, name: string, preset: Preset): Draft {
  const selected = presetSkills(model, preset)
  return { original: name, name, selected, base: new Set(selected) }
}

/** What a discard would throw away, and what to do after. */
type Pending = { then: () => void } | null

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  banner: { margin: '0 32px 12px', flexShrink: 0 },
  split: { display: 'flex', gap: '16px', flexGrow: 1, minHeight: 0, padding: '0 32px 24px' },
  listPane: {
    width: '240px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: 0,
  },
  list: { display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', minHeight: 0, paddingBottom: '8px' },
  item: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '9px 12px 9px 16px',
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
      top: '12px',
      bottom: '12px',
      width: '3px',
      borderRadius: '2px',
      backgroundColor: tokens.colorBrandForeground1,
    },
  },
  itemName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemMeta: { color: tokens.colorNeutralForeground3 },
  editor: {
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
  editorHead: { display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px 20px 12px' },
  nameRow: { display: 'flex', alignItems: 'flex-end', gap: '12px' },
  nameField: { flexGrow: 1, maxWidth: '360px' },
  more: { marginLeft: 'auto' },
  filters: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  search: { flexGrow: 1, maxWidth: '420px', minWidth: '200px' },
  pickerScroll: { flexGrow: 1, overflowY: 'auto', padding: '0 20px', borderTop: `1px solid ${tokens.colorNeutralStroke3}`, minHeight: 0 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '10px 16px 10px 20px',
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: `0 0 ${tokens.borderRadiusLarge} ${tokens.borderRadiusLarge}`,
  },
  stats: { display: 'flex', alignItems: 'center', gap: '8px', color: tokens.colorNeutralForeground2 },
  actions: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' },
  placeholder: { margin: 'auto', color: tokens.colorNeutralForeground3, padding: '24px', textAlign: 'center' },
})

function cleanName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME)
}

export function AgentsPage({ state, actions, model }: { state: DataState; actions: Actions; model: Model }) {
  const styles = useStyles()
  const strings = useStrings()
  const t = strings.agents
  const notify = useNotify()
  const presets = state.value.library.presets
  const names = Object.keys(presets)

  const [draft, setDraft] = useState<Draft | null>(() => {
    const first = names[0]
    const preset = first === undefined ? undefined : presets[first]
    return first === undefined || preset === undefined ? null : draftOf(model, first, preset)
  })
  const [nameError, setNameError] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const [isOnlySelected, setIsOnlySelected] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const isDirty =
    draft !== null && (draft.original === null || cleanName(draft.name) !== draft.original || !sameSet(draft.selected, draft.base))

  // The file changed (the plugin's panel, a hand edit): an untouched draft follows it, an edited one keeps its edits.
  useEffect(() => {
    setDraft(old => {
      if (old === null || old.original === null) return old
      const preset = presets[old.original]
      const isUntouched = sameSet(old.selected, old.base)
      if (preset === undefined) return isUntouched ? null : { ...old, original: null }
      const base = presetSkills(model, preset)
      if (sameSet(base, old.base)) return old
      return isUntouched ? { ...old, selected: base, base } : { ...old, base }
    })
  }, [presets, model])

  const guard = (then: () => void): void => {
    if (isDirty) setPending({ then })
    else then()
  }

  const open = (name: string): void => {
    const preset = presets[name]
    if (preset === undefined) return
    guard(() => {
      setDraft(draftOf(model, name, preset))
      setNameError(undefined)
    })
  }

  const startNew = (from?: { name: string; selected: Set<string> }): void =>
    guard(() => {
      setDraft({
        original: null,
        name: from === undefined ? '' : copyName(from.name, names, t.copySuffix),
        selected: new Set(from?.selected ?? []),
        base: new Set(),
      })
      setNameError(undefined)
    })

  const save = async (): Promise<void> => {
    if (draft === null) return
    const name = cleanName(draft.name)
    const problem =
      name === ''
        ? t.errors.empty
        : RESERVED_NAMES.includes(name)
          ? t.errors.reserved(name)
          : name !== draft.original && name in presets
            ? t.errors.taken(name)
            : undefined
    if (problem !== undefined) {
      setNameError(problem)
      return
    }
    try {
      await actions.saveAgent(draft.original, name, selectionPreset(model, draft.selected))
      notify(draft.original === null ? t.created(name) : t.saved(name))
      setDraft({ ...draft, original: name, name, base: new Set(draft.selected) })
      setNameError(undefined)
    } catch (error) {
      if (error instanceof NameTakenError) setNameError(t.errors.taken(name))
      else notify(String(error), 'error')
    }
  }

  const prepare = async (): Promise<void> => {
    if (draft === null) return
    try {
      await actions.prepareNext(draft.original, selectionPreset(model, draft.selected))
      notify(t.prepared, 'success')
    } catch (error) {
      notify(String(error), 'error')
    }
  }

  const remove = async (name: string): Promise<void> => {
    setDeleting(null)
    try {
      await actions.deleteAgent(name)
      notify(t.deleted(name))
      setDraft(null)
    } catch (error) {
      notify(String(error), 'error')
    }
  }

  const loaded = draft === null ? new Set<string>() : loadedOf(model, draft.selected)

  return (
    <div className={styles.page}>
      <PageHeader title={t.title} intro={t.intro} />
      <NextBanner state={state} actions={actions} model={model} />
      <div className={styles.split}>
        <div className={styles.listPane}>
          <Button icon={<Add20Regular />} onClick={() => startNew()}>
            {t.create}
          </Button>
          <div className={styles.list} role="listbox" aria-label={t.title}>
            {names.length === 0 ? (
              <Caption1 className={styles.itemMeta}>{t.none}</Caption1>
            ) : (
              names.map(name => {
                const preset = presets[name]
                const set = preset === undefined ? new Set<string>() : loadedOf(model, presetSkills(model, preset))
                const isSelected = draft?.original === name
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={mergeClasses(styles.item, isSelected && styles.itemSelected)}
                    onClick={() => open(name)}
                  >
                    <Body1Strong className={styles.itemName}>{name}</Body1Strong>
                    <Caption1 className={styles.itemMeta}>
                      {model.names.length > 0
                        ? `${strings.skillCount(set.size)} · ${strings.tokens(formatTokens(tokensOf(model, set)))}`
                        : strings.skillCount(preset === undefined ? 0 : preset.skills.length)}
                    </Caption1>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className={styles.editor}>
          {draft === null ? (
            <Body1 className={styles.placeholder}>{names.length === 0 ? t.noneHint : t.pickOne}</Body1>
          ) : (
            <>
              <div className={styles.editorHead}>
                <div className={styles.nameRow}>
                  <Field
                    className={styles.nameField}
                    label={t.name}
                    validationState={nameError === undefined ? 'none' : 'error'}
                    validationMessage={nameError}
                  >
                    <Input
                      value={draft.name}
                      placeholder={t.namePlaceholder}
                      maxLength={MAX_NAME}
                      onChange={(_, data) => {
                        setDraft({ ...draft, name: data.value })
                        setNameError(undefined)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') void save()
                      }}
                    />
                  </Field>
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Button className={styles.more} appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={strings.more} />
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem
                          icon={<Copy20Regular />}
                          onClick={() => startNew({ name: cleanName(draft.name) || t.newName, selected: draft.selected })}
                        >
                          {strings.duplicate}
                        </MenuItem>
                        <MenuItem
                          icon={<Delete20Regular />}
                          disabled={draft.original === null}
                          onClick={() => draft.original !== null && setDeleting(draft.original)}
                        >
                          {strings.delete}
                        </MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </div>
                <div className={styles.filters}>
                  <SearchBox
                    className={styles.search}
                    placeholder={t.search}
                    value={query}
                    onChange={(_, data) => setQuery(data.value)}
                  />
                  <Switch label={t.onlySelected} checked={isOnlySelected} onChange={(_, data) => setIsOnlySelected(data.checked)} />
                </div>
              </div>
              <div className={styles.pickerScroll}>
                <SkillPicker
                  model={model}
                  selected={draft.selected}
                  onChange={selected => setDraft({ ...draft, selected })}
                  query={query}
                  isOnlySelected={isOnlySelected}
                />
              </div>
              <div className={styles.footer}>
                <div className={styles.stats}>
                  <Body1Strong>{strings.skillCount(loaded.size)}</Body1Strong>
                  <Caption1>{strings.tokens(formatTokens(tokensOf(model, loaded)))}</Caption1>
                  {isDirty ? (
                    <Badge appearance="tint" color="warning" size="small">
                      {t.unsaved}
                    </Badge>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <Tooltip content={t.prepareHint} relationship="description">
                    <Button icon={<Rocket20Regular />} onClick={() => void prepare()} disabled={model.names.length === 0}>
                      {t.prepare}
                    </Button>
                  </Tooltip>
                  <Button appearance="primary" icon={<Save20Regular />} onClick={() => void save()} disabled={!isDirty}>
                    {strings.save}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={pending !== null} onOpenChange={(_, data) => !data.open && setPending(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t.discardTitle}</DialogTitle>
            <DialogContent>{t.discardBody}</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPending(null)}>
                {t.keepEditing}
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  const then = pending?.then
                  setPending(null)
                  then?.()
                }}
              >
                {t.discard}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(_, data) => !data.open && setDeleting(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{deleting === null ? '' : t.deleteTitle(deleting)}</DialogTitle>
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

/** The set prepared for the next session, while there is one to tell about. */
function NextBanner({ state, actions, model }: { state: DataState; actions: Actions; model: Model }) {
  const styles = useStyles()
  const strings = useStrings()
  const t = strings.agents
  const next = state.next
  if (next === null) return null

  if (next.kind !== 'ready') {
    return (
      <MessageBar className={styles.banner} intent={next.kind === 'used' ? 'success' : 'warning'}>
        <MessageBarBody>{next.kind === 'used' ? t.nextUsed : t.nextExpired}</MessageBarBody>
        <MessageBarActions>
          <Button size="small" onClick={() => void actions.clearNext()}>
            {strings.gotIt}
          </Button>
        </MessageBarActions>
      </MessageBar>
    )
  }

  const set = presetSkills(model, next.next.preset)
  const basePreset = next.next.basedOn === null ? undefined : state.value.library.presets[next.next.basedOn]
  const based =
    basePreset === undefined || next.next.basedOn === null
      ? t.custom
      : (() => {
          const { added, removed } = changesFrom(set, presetSkills(model, basePreset))
          return t.basedOn(next.next.basedOn, added, removed)
        })()
  const left = timeLeft(strings, next.next.createdAt + 2 * 60 * 60 * 1000 - state.now)

  return (
    <MessageBar className={styles.banner} intent="info" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>{t.nextReadyTitle}</MessageBarTitle>
        <br />
        {t.nextReady(based, loadedOf(model, set).size, left)}
      </MessageBarBody>
      <MessageBarActions>
        <Button size="small" onClick={() => void actions.clearNext()}>
          {t.withdraw}
        </Button>
      </MessageBarActions>
    </MessageBar>
  )
}
