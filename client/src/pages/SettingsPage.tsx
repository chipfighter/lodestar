import { useState } from 'react'

import {
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Link,
  Option,
  Radio,
  RadioGroup,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import { ArrowReset20Regular, FolderOpen20Regular } from '@fluentui/react-icons'

import type { Language } from '../../../plugin/types'
import { FILES } from '../data/files'
import type { Actions, DataState } from '../data/useData'
import { timeAgo, useStrings } from '../i18n'
import { PageHeader, Section, SettingRow, useNotify } from '../ui/common'

const REPOSITORY = 'https://github.com/chipfighter/lodestar'

const useStyles = makeStyles({
  scroll: { overflowY: 'auto', height: '100%' },
  sections: { display: 'flex', flexDirection: 'column', gap: '24px', padding: '0 32px 32px', maxWidth: '860px' },
  path: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    wordBreak: 'break-all',
  },
  status: { display: 'flex', flexDirection: 'column', gap: '2px' },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  dim: { color: tokens.colorNeutralForeground3 },
  language: { minWidth: '160px' },
})

export function SettingsPage({ state, actions }: { state: DataState; actions: Actions }) {
  const styles = useStyles()
  const strings = useStrings()
  const t = strings.settings
  const notify = useNotify()
  const [isResetting, setIsResetting] = useState(false)
  const prefs = state.value.prefs

  const run = (work: Promise<void>, done?: string): void =>
    void work.then(
      () => done !== undefined && notify(done),
      error => notify(String(error), 'error'),
    )

  const libraryText = (() => {
    switch (state.status.kind) {
      case 'ok':
        return <Caption1 className={styles.ok}>{t.fileOk}</Caption1>
      case 'missing':
        return <Caption1 className={styles.dim}>{t.fileMissing}</Caption1>
      case 'invalid':
        return <Caption1 className={styles.bad}>{t.fileInvalid(state.status.error)}</Caption1>
      case 'unreadable':
        return <Caption1 className={styles.bad}>{t.fileUnreadable(state.status.error)}</Caption1>
    }
  })()

  const catalog = state.catalog
  const catalogText =
    catalog.exists && catalog.updatedAt !== null ? (
      <Caption1 className={styles.ok}>{t.catalogOk(catalog.skills.length, timeAgo(strings, catalog.updatedAt, state.now))}</Caption1>
    ) : (
      <Caption1 className={styles.dim}>{t.catalogMissing}</Caption1>
    )

  return (
    <div className={styles.scroll}>
      <PageHeader title={t.title} />
      <div className={styles.sections}>
        <Section title={t.claude}>
          <SettingRow title={t.ask} hint={t.askHint}>
            <Switch
              checked={prefs.askOnNewSession}
              aria-label={t.ask}
              onChange={(_, data) => run(actions.setPrefs({ askOnNewSession: data.checked }))}
            />
          </SettingRow>
          <SettingRow title={t.picker} hint={t.pickerHint}>
            <RadioGroup
              layout="horizontal"
              aria-label={t.picker}
              value={prefs.subagentPicker}
              onChange={(_, data) => run(actions.setPrefs({ subagentPicker: data.value === 'person' ? 'person' : 'agent' }))}
            >
              <Radio value="agent" label={t.pickerAgent} />
              <Radio value="person" label={t.pickerPerson} />
            </RadioGroup>
          </SettingRow>
        </Section>

        <Section title={t.app}>
          <SettingRow title={t.language} hint={t.languageHint}>
            <Dropdown
              className={styles.language}
              aria-label={t.language}
              value={t.languages[prefs.language]}
              selectedOptions={[prefs.language]}
              onOptionSelect={(_, data) => run(actions.setPrefs({ language: (data.optionValue ?? 'auto') as Language }))}
            >
              {(['auto', 'zh', 'en'] as const).map(language => (
                <Option key={language} value={language}>
                  {t.languages[language]}
                </Option>
              ))}
            </Dropdown>
          </SettingRow>
          <SettingRow title={t.autostart} hint={t.autostartHint}>
            <Switch
              checked={state.autostart === true}
              disabled={state.autostart === null}
              aria-label={t.autostart}
              onChange={(_, data) => run(actions.setAutostart(data.checked))}
            />
          </SettingRow>
        </Section>

        <Section title={t.data}>
          <SettingRow
            title={t.folder}
            hint={
              <span className={styles.status}>
                <span>{t.folderHint}</span>
                <span className={styles.path}>{state.dataDir ?? t.noFolder}</span>
              </span>
            }
          >
            <Button icon={<FolderOpen20Regular />} disabled={state.dataDir === null} onClick={() => run(actions.openDataDir())}>
              {strings.open}
            </Button>
          </SettingRow>
          <SettingRow title={FILES.library} hint={libraryText} />
          <SettingRow title={t.catalog} hint={catalogText} />
          <SettingRow title={t.reset} hint={t.resetHint}>
            <Button icon={<ArrowReset20Regular />} onClick={() => setIsResetting(true)}>
              {t.resetButton}
            </Button>
          </SettingRow>
        </Section>

        <Section title={t.about}>
          <SettingRow title={strings.appName} hint={t.version(__APP_VERSION__)}>
            <Link onClick={() => run(actions.openUrl(REPOSITORY))}>{t.source}</Link>
          </SettingRow>
        </Section>
      </div>

      <Dialog open={isResetting} onOpenChange={(_, data) => setIsResetting(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t.resetTitle}</DialogTitle>
            <DialogContent>
              <Body1>{t.resetBody}</Body1>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setIsResetting(false)}>
                {strings.cancel}
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setIsResetting(false)
                  run(actions.resetDefaults(), t.resetDone)
                }}
              >
                {t.resetButton.replace('…', '')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
