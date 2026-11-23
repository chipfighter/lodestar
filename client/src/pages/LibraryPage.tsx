import { useState } from 'react'

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
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
  SearchBox,
  Subtitle2,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  Add20Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Delete20Regular,
  Dismiss16Regular,
  Folder16Regular,
  FolderArrowRight20Regular,
  MoreHorizontal20Regular,
  Rename20Regular,
} from '@fluentui/react-icons'

import { MAX_NAME, plainName, type Group } from '@shared/listing'
import { matchesSearch, type Model } from '../data/model'
import { NameTakenError, type Actions, type DataState } from '../data/useData'
import { useStrings } from '../i18n'
import { PageHeader, groupTitle, useNotify } from '../ui/common'
import { usePlatform } from '../ui/platform'

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  toolbar: { padding: '0 32px 16px', flexShrink: 0 },
  search: { width: '100%', maxWidth: '420px' },
  scroll: { flexGrow: 1, minHeight: 0, overflowY: 'auto', padding: '0 32px 24px' },
  section: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '1000px', marginBottom: '24px' },
  sectionHead: { display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 4px' },
  hint: { color: tokens.colorNeutralForeground3 },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
  },
  block: { ':not(:last-child)': { borderBottom: `1px solid ${tokens.colorNeutralStroke3}` } },
  blockHead: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px 4px 10px', minHeight: '44px' },
  expander: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexGrow: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  chevron: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  folder: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  blockName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  blockUse: {
    marginLeft: 'auto',
    paddingLeft: '16px',
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  renameField: { flexGrow: 1, maxWidth: '280px', padding: '4px 0' },
  skills: { paddingBottom: '6px' },
  skill: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    columnGap: '16px',
    padding: '5px 12px 5px 36px',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    // A loose skill's "Move to…" shows on the row under the pointer or the keyboard, not on every row at once.
    '&:hover .lodestar-move': { opacity: 1 },
    '&:focus-within .lodestar-move': { opacity: 1 },
  },
  skillText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  name: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  description: { color: tokens.colorNeutralForeground3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  side: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', minWidth: 0 },
  used: { color: tokens.colorNeutralForeground3, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  move: { minWidth: 'auto', opacity: 0, '&[aria-expanded="true"]': { opacity: 1 } },
  remove: { minWidth: 'auto', color: tokens.colorNeutralForeground3 },
  empty: { display: 'block', padding: '2px 12px 10px 36px', color: tokens.colorNeutralForeground3 },
  create: { padding: '10px 12px 12px 10px', borderTop: `1px solid ${tokens.colorNeutralStroke3}` },
  createField: { maxWidth: '320px' },
  noMatch: { display: 'block', padding: '32px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
})

function cleanName(raw: string): string {
  return plainName(raw)
}

type Shown = { group: Group; names: string[] }
type Renaming = { label: string; draft: string; error?: string }

/**
 * Every skill there is, by where it came from: the loose ones (in the person's categories, then the
 * rest), then the plugins' and Claude's own. What each does and which Agents use it; loose skills can
 * be moved between categories. Putting skills together is the Agents page's job, not this one's.
 */
export function LibraryPage({ state, actions, model }: { state: DataState; actions: Actions; model: Model }) {
  const styles = useStyles()
  const strings = useStrings()
  const t = strings.library
  const notify = useNotify()
  const isCodex = usePlatform() === 'codex'
  const [query, setQuery] = useState('')
  // Categories and the uncategorized skills open by themselves, plugins and the rest closed; a click flips one.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | undefined>()
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)

  const isSearching = query.trim() !== ''
  const presets = state.value.library.presets
  const categories = model.groups.filter(group => group.kind === 'custom')

  const shownOf = (groups: readonly Group[]): Shown[] =>
    groups
      .map(group => ({
        group,
        names: group.names.filter(name => {
          const skill = model.byName.get(name)
          return skill !== undefined && matchesSearch(skill, query)
        }),
      }))
      .filter(one => (isSearching ? one.names.length > 0 : one.group.kind === 'custom' || one.names.length > 0))
  const loose = shownOf(model.groups.filter(group => group.kind !== 'fixed'))
  const fixed = shownOf(model.groups.filter(group => group.kind === 'fixed'))

  const isOpen = (group: Group): boolean => {
    const byDefault = isSearching || group.kind !== 'fixed'
    return toggled.has(group.id) ? !byDefault : byDefault
  }
  const toggle = (id: string): void =>
    setToggled(old => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const wholeUsers = (group: Group): string[] =>
    Object.entries(presets)
      .filter(([, preset]) => preset.groups.includes(group.id))
      .map(([name]) => name)

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
    } catch (error) {
      if (error instanceof NameTakenError) setCreateError(t.taken(name))
      else notify(String(error), 'error')
    }
  }

  const rename = async (): Promise<void> => {
    if (renaming === null) return
    const to = cleanName(renaming.draft)
    if (to === '' || to === renaming.label) {
      setRenaming(null)
      return
    }
    if (to in state.value.library.groups) {
      setRenaming({ ...renaming, error: t.taken(to) })
      return
    }
    try {
      await actions.renameGroup(renaming.label, to)
      notify(t.renamed(to))
      setRenaming(null)
    } catch (error) {
      if (error instanceof NameTakenError) setRenaming({ ...renaming, error: t.taken(to) })
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

  // The categories menu hands back the whole ticked list; what changed is one category, in or out.
  const setCategories = async (skill: string, before: readonly string[], after: readonly string[]): Promise<void> => {
    try {
      for (const label of after.filter(one => !before.includes(one))) {
        await actions.setGroupMember(label, skill, true)
        notify(t.added(skill, label))
      }
      for (const label of before.filter(one => !after.includes(one))) {
        await actions.setGroupMember(label, skill, false)
        notify(t.removed(skill, label))
      }
    } catch (error) {
      notify(String(error), 'error')
    }
  }

  const skillRow = (name: string, group: Group) => {
    const skill = model.byName.get(name)
    const usedBy = model.usedBy.get(name) ?? []
    const isAlways = model.always.has(name)
    // A plugin's skills show their own name; the plugin is the group.
    const shownName = group.id.startsWith('p:') && name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
    const inCategories = (model.categoriesOf.get(name) ?? []).map(category => category.label)
    const elsewhere = inCategories.filter(label => label !== group.label)
    const used = usedBy.length > 0 ? t.usedBy(usedBy.join(strings.listSep)) : '—'

    return (
      <div key={name} className={styles.skill}>
        <div className={styles.skillText}>
          <span className={styles.name} title={name}>
            {shownName}
          </span>
          {skill?.description ? (
            <Caption1 className={styles.description} title={skill.description}>
              {skill.description}
            </Caption1>
          ) : null}
        </div>
        <div className={styles.side}>
          {group.kind === 'custom' && elsewhere.length > 0 ? (
            <Badge appearance="outline" color="informative" size="small">
              {t.alsoIn(elsewhere.join(strings.listSep))}
            </Badge>
          ) : null}
          {model.off.has(name) ? (
            <Tooltip content={strings.codex.offHereHint} relationship="description">
              <Badge appearance="outline" color="warning" size="small">
                {strings.codex.offHere}
              </Badge>
            </Tooltip>
          ) : null}
          {isAlways ? (
            <Tooltip content={strings.alwaysOnHint} relationship="description">
              <Badge appearance="outline" color="subtle" size="small">
                {strings.kind.alwaysOn}
              </Badge>
            </Tooltip>
          ) : (
            <Caption1 className={styles.used} title={used}>
              {used}
            </Caption1>
          )}
          {group.kind === 'fixed' ? null : (
            <Menu
              checkedValues={{ categories: inCategories }}
              onCheckedValueChange={(_, data) => void setCategories(name, inCategories, data.checkedItems)}
            >
              <MenuTrigger disableButtonEnhancement>
                <Button
                  className={mergeClasses(styles.move, 'lodestar-move')}
                  appearance="subtle"
                  size="small"
                  icon={<FolderArrowRight20Regular />}
                >
                  {t.categories}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {categories.map(category => (
                    <MenuItemCheckbox key={category.id} name="categories" value={category.label} icon={<Folder16Regular />}>
                      {category.label}
                    </MenuItemCheckbox>
                  ))}
                  {categories.length === 0 ? <MenuItem disabled>{t.noCategories}</MenuItem> : null}
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
          {/* Out of this category alone, in one click; the others it is in keep it. */}
          {group.kind === 'custom' ? (
            <Tooltip content={t.removeFrom(group.label)} relationship="label">
              <Button
                className={styles.remove}
                appearance="subtle"
                size="small"
                icon={<Dismiss16Regular />}
                onClick={() => void setCategories(name, inCategories, inCategories.filter(label => label !== group.label))}
              />
            </Tooltip>
          ) : null}
        </div>
      </div>
    )
  }

  const block = ({ group, names }: Shown) => {
    const open = isOpen(group)
    const users = group.kind === 'ungrouped' ? [] : wholeUsers(group)
    const isRenaming = group.kind === 'custom' && renaming?.label === group.label

    return (
      <div key={group.id} className={styles.block}>
        <div className={styles.blockHead}>
          {isRenaming && renaming !== null ? (
            <Field
              className={styles.renameField}
              validationState={renaming.error === undefined ? 'none' : 'error'}
              validationMessage={renaming.error}
            >
              <Input
                autoFocus
                size="small"
                value={renaming.draft}
                maxLength={MAX_NAME}
                contentBefore={<Folder16Regular className={styles.folder} />}
                onChange={(_, data) => setRenaming({ label: renaming.label, draft: data.value })}
                onBlur={() => void rename()}
                onKeyDown={event => {
                  if (event.key === 'Enter') void rename()
                  if (event.key === 'Escape') setRenaming(null)
                }}
              />
            </Field>
          ) : (
            <button type="button" className={styles.expander} aria-expanded={open} onClick={() => toggle(group.id)}>
              {open ? <ChevronDown16Regular className={styles.chevron} /> : <ChevronRight16Regular className={styles.chevron} />}
              {group.kind === 'custom' ? <Folder16Regular className={styles.folder} /> : null}
              <Body1Strong className={styles.blockName}>{groupTitle(group, strings)}</Body1Strong>
              <Caption1 className={styles.count}>{t.count(group.names.length)}</Caption1>
              {users.length > 0 ? (
                <Caption1 className={styles.blockUse}>{t.wholeUsedBy(users.join(strings.listSep))}</Caption1>
              ) : null}
            </button>
          )}
          {group.kind === 'custom' && !isRenaming ? (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={strings.more} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Rename20Regular />} onClick={() => setRenaming({ label: group.label, draft: group.label })}>
                    {strings.rename}
                  </MenuItem>
                  <MenuItem icon={<Delete20Regular />} onClick={() => setDeleting(group)}>
                    {strings.delete}
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          ) : null}
        </div>
        {open ? (
          <div className={styles.skills}>
            {names.length === 0 ? (
              <Caption1 className={styles.empty}>{t.emptyCategory}</Caption1>
            ) : (
              names.map(name => skillRow(name, group))
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t.title} intro={isCodex ? t.introCodex : t.intro} />
      <div className={styles.toolbar}>
        <SearchBox className={styles.search} placeholder={t.search} value={query} onChange={(_, data) => setQuery(data.value)} />
      </div>
      <div className={styles.scroll}>
        {isSearching && loose.length === 0 && fixed.length === 0 ? <Body1 className={styles.noMatch}>{t.noMatch}</Body1> : null}
        {loose.length > 0 || !isSearching ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <Subtitle2 as="h2">{t.loose}</Subtitle2>
              <Caption1 className={styles.hint}>{t.looseHint}</Caption1>
            </div>
            <div className={styles.card}>
              {loose.map(block)}
              {isSearching ? null : (
                <div className={styles.create}>
                  <Field
                    className={styles.createField}
                    validationState={createError === undefined ? 'none' : 'error'}
                    validationMessage={createError}
                  >
                    <Input
                      size="small"
                      value={newName}
                      placeholder={t.newCategoryPlaceholder}
                      maxLength={MAX_NAME}
                      contentBefore={<Add20Regular />}
                      aria-label={t.newCategory}
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
              )}
            </div>
          </section>
        ) : null}
        {fixed.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <Subtitle2 as="h2">{isCodex ? t.fixedCodex : t.fixed}</Subtitle2>
              <Caption1 className={styles.hint}>{isCodex ? t.fixedHintCodex : t.fixedHint}</Caption1>
            </div>
            <div className={styles.card}>{fixed.map(block)}</div>
          </section>
        ) : null}
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
