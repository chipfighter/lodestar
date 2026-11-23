import { createContext, useContext, type ReactNode } from 'react'

import { Body1, Caption1, Subtitle2, Title2, makeStyles, tokens } from '@fluentui/react-components'

import type { Group } from '@shared/listing'
import type { Strings } from '../i18n'

/** Shows a short message in the corner. */
export type Notify = (text: string, intent?: 'success' | 'error' | 'info' | 'warning') => void

export const NotifyContext = createContext<Notify>(() => undefined)

export function useNotify(): Notify {
  return useContext(NotifyContext)
}

/** A group's name as the pages show it, in the language shown. */
export function groupTitle(group: Group, strings: Strings): string {
  if (group.kind === 'ungrouped') return strings.kind.ungrouped
  if (group.kind === 'custom' || group.id.startsWith('p:')) return group.label
  const source = group.id.replace(/^s:/, '')

  return strings.sources[source] ?? source
}

const useStyles = makeStyles({
  header: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '28px 32px 16px', flexShrink: 0 },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: '720px' },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { padding: '0 4px' },
  card: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '14px 18px',
    minHeight: '44px',
    ':not(:last-child)': { borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  },
  rowText: { display: 'flex', flexDirection: 'column', gap: '2px', flexGrow: 1, minWidth: 0 },
  hint: { color: tokens.colorNeutralForeground3 },
  rowControl: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' },
})

export function PageHeader({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  const styles = useStyles()

  return (
    <header className={styles.header}>
      <Title2 as="h1">{title}</Title2>
      {intro === undefined ? null : <Body1 className={styles.intro}>{intro}</Body1>}
      {children}
    </header>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles()

  return (
    <section className={styles.section}>
      <Subtitle2 as="h2" className={styles.sectionTitle}>
        {title}
      </Subtitle2>
      <div className={styles.card}>{children}</div>
    </section>
  )
}

/** One setting: what it is and what it does, its control on the right. */
export function SettingRow({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  const styles = useStyles()

  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <Body1>{title}</Body1>
        {hint === undefined ? null : <Caption1 className={styles.hint}>{hint}</Caption1>}
      </div>
      {children === undefined ? null : <div className={styles.rowControl}>{children}</div>}
    </div>
  )
}

export const useCardStyles = useStyles
