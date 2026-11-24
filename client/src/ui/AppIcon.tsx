import { tokens } from '@fluentui/react-components'

/**
 * The Lodestar mark: star trails. In a long exposure every star draws an arc around the one
 * that stays still, the lodestar. The same drawing as docs/logo.svg; the arcs take the text
 * colour, so the mark reads in light and dark themes.
 */
export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <g style={{ fill: tokens.colorNeutralForeground1 }}>
        <path d="M144.77 60.88 A66 66 0 0 1 99.63 184.92 A12 12 0 0 1 107.84 162.37 A42 42 0 0 0 136.56 83.43 A12 12 0 0 1 144.77 60.88 Z" />
        <path d="M159.82 19.53 A110 110 0 1 1 18.83 160.52 A12 12 0 0 1 41.39 152.31 A86 86 0 1 0 151.61 42.09 A12 12 0 0 1 159.82 19.53 Z" />
      </g>
      <circle cx="122.2" cy="122.9" r="22" fill="#FF5A36" />
    </svg>
  )
}
