/**
 * The Lodestar mark: a disc missing its upper-right quarter, the cut's two straight edges an L,
 * and the guiding star where the quarter was. The same drawing as src-tauri/icons/source.svg.
 */
export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M512 512 L512 194 A318 318 0 1 0 830 512 Z" fill="#4542E8" />
      <path
        d="M700 188 C728.5 284.6 739.4 295.5 836 324 C739.4 352.5 728.5 363.4 700 460 C671.5 363.4 660.6 352.5 564 324 C660.6 295.5 671.5 284.6 700 188 Z"
        fill="#F6B22E"
      />
    </svg>
  )
}
