// Which agent platform the pages show: Claude Code, or Codex where it is installed, and more later.
// Each platform has its own skills, its own categories and Agents, and its own way of choosing an Agent.

import { createContext, useContext } from 'react'

import { Caption1, Dropdown, Option, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'

import claudeLogo from '../assets/platforms/claude.svg'
import codexLogo from '../assets/platforms/codex.png'
import type { Platform } from '../data/files'
import { useStrings } from '../i18n'

export type { Platform }

/** The platforms in the order the picker lists them, each with its own mark (Anthropic's and OpenAI's, shown only to name them). */
export const PLATFORMS: readonly { id: Platform; name: string; logo: string }[] = [
  { id: 'claude', name: 'Claude Code', logo: claudeLogo },
  { id: 'codex', name: 'Codex', logo: codexLogo },
]

export const PlatformContext = createContext<Platform>('claude')

export function usePlatform(): Platform {
  return useContext(PlatformContext)
}

const KEY = 'lodestar.platform'

/** The platform shown at the start: the link's (`?platform=codex`), else the one shown last time. */
export function initialPlatform(): Platform {
  const asked = new URLSearchParams(window.location.search).get('platform')
  if (PLATFORMS.some(one => one.id === asked)) return asked as Platform
  try {
    const kept = window.localStorage.getItem(KEY)
    return PLATFORMS.find(one => one.id === kept)?.id ?? 'claude'
  } catch {
    return 'claude'
  }
}

export function rememberPlatform(platform: Platform): void {
  try {
    window.localStorage.setItem(KEY, platform)
  } catch {
    // Remembering it is a nicety.
  }
}

const useStyles = makeStyles({
  picker: { minWidth: 0, width: '100%', margin: '0 0 6px' },
  chosen: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  option: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' },
  logo: { flexShrink: 0, display: 'block', objectFit: 'contain' },
  dim: { opacity: 0.45, filter: 'grayscale(1)' },
  missing: { marginLeft: 'auto', color: tokens.colorNeutralForeground3 },
})

/** A platform's mark at `size` pixels; greyed for one not installed here. */
export function PlatformLogo({ platform, size = 18, isDim = false }: { platform: Platform; size?: number; isDim?: boolean }) {
  const styles = useStyles()
  const logo = PLATFORMS.find(one => one.id === platform)?.logo

  return logo === undefined ? null : (
    <img className={mergeClasses(styles.logo, isDim && styles.dim)} src={logo} width={size} height={size} alt="" draggable={false} />
  )
}

/** A dropdown of the platforms, each with its mark; one not installed here shows but can't be picked. */
export function PlatformPicker({
  platform,
  available,
  onChange,
}: {
  platform: Platform
  available: ReadonlySet<Platform>
  onChange: (platform: Platform) => void
}) {
  const styles = useStyles()
  const strings = useStrings()
  const current = PLATFORMS.find(one => one.id === platform) ?? PLATFORMS[0]!

  return (
    <Dropdown
      className={styles.picker}
      aria-label={strings.platform.label}
      value={current.name}
      selectedOptions={[current.id]}
      onOptionSelect={(_, data) => {
        const picked = PLATFORMS.find(one => one.id === data.optionValue)
        if (picked !== undefined && available.has(picked.id)) onChange(picked.id)
      }}
      button={{
        children: (
          <span className={styles.chosen}>
            <PlatformLogo platform={current.id} />
            <span className={styles.name}>{current.name}</span>
          </span>
        ),
      }}
    >
      {PLATFORMS.map(one => (
        <Option key={one.id} value={one.id} text={one.name} disabled={!available.has(one.id)}>
          <span className={styles.option}>
            <PlatformLogo platform={one.id} isDim={!available.has(one.id)} />
            {one.name}
            {available.has(one.id) ? null : <Caption1 className={styles.missing}>{strings.platform.notFound}</Caption1>}
          </span>
        </Option>
      ))}
    </Dropdown>
  )
}
