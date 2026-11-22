import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Caption1,
  FluentProvider,
  Spinner,
  Subtitle2,
  Tab,
  TabList,
  Toast,
  ToastTitle,
  Toaster,
  Tooltip,
  makeStyles,
  tokens,
  useId,
  useToastController,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components'
import {
  PeopleTeam24Filled,
  PeopleTeam24Regular,
  Settings24Filled,
  Settings24Regular,
  TagMultiple24Filled,
  TagMultiple24Regular,
  bundleIcon,
} from '@fluentui/react-icons'

import { backend } from './data/backend'
import { buildModel } from './data/model'
import { useData } from './data/useData'
import { StringsContext, stringsFor } from './i18n'
import { AgentsPage } from './pages/AgentsPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppIcon } from './ui/AppIcon'
import { NotifyContext, type Notify } from './ui/common'

const AgentsIcon = bundleIcon(PeopleTeam24Filled, PeopleTeam24Regular)
const GroupsIcon = bundleIcon(TagMultiple24Filled, TagMultiple24Regular)
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular)

type Page = 'agents' | 'groups' | 'settings'

const PAGES: readonly Page[] = ['agents', 'groups', 'settings']

/** The page a link names (`#groups`), so that each page can be opened directly. */
function pageFromHash(): Page {
  const named = window.location.hash.replace(/^#/, '')
  return PAGES.find(page => page === named) ?? 'agents'
}

// The provider's own class is copied onto its pop-up layers (tooltips, toasts), so the page's
// background and height go on the shell inside it; index.html gives the provider its height.
const useStyles = makeStyles({
  shell: { display: 'flex', height: '100%', backgroundColor: tokens.colorNeutralBackground2 },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '220px',
    flexShrink: 0,
    padding: '18px 12px 14px',
    boxSizing: 'border-box',
  },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 8px 10px' },
  tabs: { gap: '2px' },
  navFooter: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' },
  version: { color: tokens.colorNeutralForeground3 },
  main: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loading: { margin: 'auto' },
})

function useSystemDark(): boolean {
  const query = '(prefers-color-scheme: dark)'
  const [isDark, setIsDark] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const changed = (): void => setIsDark(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])

  return isDark
}

export function App() {
  const styles = useStyles()
  const isDark = useSystemDark()
  const { state, actions } = useData()
  const [page, setPage] = useState<Page>(pageFromHash)
  useEffect(() => {
    const followed = (): void => setPage(pageFromHash())
    window.addEventListener('hashchange', followed)
    return () => window.removeEventListener('hashchange', followed)
  }, [])
  const strings = stringsFor(state.value.prefs.language, navigator.language)
  const model = useMemo(
    () => buildModel(state.catalog.skills, state.value.library, state.catalog.alwaysOn),
    [state.catalog, state.value.library],
  )
  const toasterId = useId('toaster')
  const { dispatchToast } = useToastController(toasterId)
  const notify = useCallback<Notify>(
    (text, intent = 'success') =>
      dispatchToast(
        <Toast>
          <ToastTitle>{text}</ToastTitle>
        </Toast>,
        { intent, timeout: intent === 'error' ? 6000 : 3500 },
      ),
    [dispatchToast],
  )
  useEffect(() => {
    document.documentElement.lang = strings.locale
    document.title = strings.appName
    void backend()
      .then(b => b.setLabels(strings.appName, strings.trayOpen, strings.trayQuit))
      .catch(() => undefined)
  }, [strings])

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      <StringsContext.Provider value={strings}>
        <NotifyContext.Provider value={notify}>
          <div className={styles.shell}>
            <nav className={styles.nav} aria-label={strings.appName}>
              <div className={styles.brand}>
                <AppIcon size={28} />
                <Subtitle2>{strings.appName}</Subtitle2>
              </div>
              <TabList
                vertical
                size="large"
                className={styles.tabs}
                selectedValue={page}
                onTabSelect={(_, data) => {
                  setPage(data.value as Page)
                  window.history.replaceState(null, '', `#${String(data.value)}`)
                }}
              >
                <Tab value="agents" icon={<AgentsIcon />}>
                  {strings.nav.agents}
                </Tab>
                <Tab value="groups" icon={<GroupsIcon />}>
                  {strings.nav.groups}
                </Tab>
                <Tab value="settings" icon={<SettingsIcon />}>
                  {strings.nav.settings}
                </Tab>
              </TabList>
              <div className={styles.navFooter}>
                {state.isSample ? (
                  <Tooltip content={strings.sampleHint} relationship="description">
                    <Badge appearance="tint" color="warning" size="medium">
                      {strings.sample}
                    </Badge>
                  </Tooltip>
                ) : null}
                <Caption1 className={styles.version}>v{__APP_VERSION__}</Caption1>
              </div>
            </nav>
            <main className={styles.main}>
              {!state.isReady ? (
                <Spinner className={styles.loading} />
              ) : page === 'agents' ? (
                <AgentsPage state={state} actions={actions} model={model} />
              ) : page === 'groups' ? (
                <GroupsPage state={state} actions={actions} model={model} />
              ) : (
                <SettingsPage state={state} actions={actions} />
              )}
            </main>
          </div>
          <Toaster toasterId={toasterId} position="bottom-end" />
        </NotifyContext.Provider>
      </StringsContext.Provider>
    </FluentProvider>
  )
}
