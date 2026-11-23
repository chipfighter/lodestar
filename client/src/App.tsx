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
  Library24Filled,
  Library24Regular,
  PeopleTeam24Filled,
  PeopleTeam24Regular,
  Settings24Filled,
  Settings24Regular,
  bundleIcon,
} from '@fluentui/react-icons'

import { backend } from './data/backend'
import { buildModel } from './data/model'
import { useData } from './data/useData'
import { StringsContext, stringsFor } from './i18n'
import { AgentsPage } from './pages/AgentsPage'
import { LibraryPage } from './pages/LibraryPage'
import { SettingsPage } from './pages/SettingsPage'
import { AppIcon } from './ui/AppIcon'
import { NotifyContext, type Notify } from './ui/common'
import { PlatformContext, PlatformPicker, initialPlatform, rememberPlatform, type Platform } from './ui/platform'

const AgentsIcon = bundleIcon(PeopleTeam24Filled, PeopleTeam24Regular)
const LibraryIcon = bundleIcon(Library24Filled, Library24Regular)
const SettingsIcon = bundleIcon(Settings24Filled, Settings24Regular)

type Page = 'agents' | 'library' | 'settings'

const PAGES: readonly Page[] = ['agents', 'library', 'settings']

/** A screenshot for the README (`?shot`): the sample-data tag stays out of the picture. */
const IS_SHOT = new URLSearchParams(window.location.search).has('shot')

/** The page a link names (`#library`), so that each page can be opened directly; `#groups` is its old name. */
function pageFromHash(): Page {
  const named = window.location.hash.replace(/^#/, '')
  return PAGES.find(page => page === named) ?? (named === 'groups' ? 'library' : 'agents')
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
  brand: { display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 6px 8px' },
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
  // Codex can be picked only where it is installed.
  const [chosen, setChosen] = useState<Platform>(initialPlatform)
  const hasCodex = state.codex.info != null
  const available = useMemo(() => new Set<Platform>(hasCodex ? ['claude', 'codex'] : ['claude']), [hasCodex])
  const platform: Platform = available.has(chosen) ? chosen : 'claude'
  const choosePlatform = useCallback((next: Platform) => {
    setChosen(next)
    rememberPlatform(next)
  }, [])
  const model = useMemo(() => {
    if (platform === 'claude') return buildModel(state.catalog.skills, state.value.library, state.catalog.alwaysOn)
    // What the person switched off in Codex themselves; Lodestar's own switches come and go with the Agent.
    const ours = new Set(state.codex.record?.names ?? [])
    const off = state.codex.off.filter(name => !ours.has(name))
    return buildModel(state.codex.catalog.skills, state.value.library, state.codex.catalog.alwaysOn, off)
  }, [platform, state.catalog, state.value.library, state.codex.catalog, state.codex.off, state.codex.record])
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
        <PlatformContext.Provider value={platform}>
        <NotifyContext.Provider value={notify}>
          <div className={styles.shell}>
            <nav className={styles.nav} aria-label={strings.appName}>
              <div className={styles.brand}>
                <AppIcon size={34} />
                <Subtitle2>{strings.appName}</Subtitle2>
              </div>
              <PlatformPicker platform={platform} available={available} onChange={choosePlatform} />
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
                <Tab value="library" icon={<LibraryIcon />}>
                  {strings.nav.library}
                </Tab>
                <Tab value="settings" icon={<SettingsIcon />}>
                  {strings.nav.settings}
                </Tab>
              </TabList>
              <div className={styles.navFooter}>
                {state.isSample && !IS_SHOT ? (
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
              ) : page === 'library' ? (
                <LibraryPage state={state} actions={actions} model={model} />
              ) : (
                <SettingsPage state={state} actions={actions} />
              )}
            </main>
          </div>
          <Toaster toasterId={toasterId} position="bottom-end" />
        </NotifyContext.Provider>
        </PlatformContext.Provider>
      </StringsContext.Provider>
    </FluentProvider>
  )
}
