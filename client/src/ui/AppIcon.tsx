import { tokens } from '@fluentui/react-components'

/**
 * The Lodestar mark: star trails. In a long exposure every star draws an arc around the one that
 * stays still, the lodestar. The same drawing as docs/logo.svg; the rings take the text colour, so
 * the mark reads in light and dark themes.
 */
export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <path
        style={{ fill: tokens.colorNeutralForeground1 }}
        d="M126.57 54.89A71.68 71.68 0 1 1 54.89 126.57L75.95 126.57A50.62 50.62 0 1 0 126.57 75.95ZM14.57 126.57A112 112 0 0 1 126.57 14.57L126.57 36.52A90.05 90.05 0 0 0 36.52 126.57ZM238.57 126.57A112 112 0 0 1 126.57 238.57L126.57 216.62A90.05 90.05 0 0 0 216.62 126.57Z"
      />
      <circle cx="126.57" cy="126.57" r="16.24" fill="#FF5A36" />
    </svg>
  )
}
