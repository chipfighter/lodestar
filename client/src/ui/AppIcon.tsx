/** The app's mark: a list with ticked slots, the loadout. The same drawing as src-tauri/icons/source.svg. */
export function AppIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id="app-icon-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="208" fill="url(#app-icon-fill)" />
      <g fill="#fff">
        <circle cx="318" cy="352" r="66" />
        <rect x="426" y="318" width="330" height="68" rx="34" />
        <circle cx="318" cy="534" r="66" />
        <rect x="426" y="500" width="330" height="68" rx="34" />
        <circle cx="318" cy="716" r="66" fillOpacity="0.4" />
        <rect x="426" y="682" width="250" height="68" rx="34" fillOpacity="0.4" />
      </g>
      <g fill="none" stroke="#4F46E5" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round">
        <path d="M288 352 l22 24 l40 -46" />
        <path d="M288 534 l22 24 l40 -46" />
      </g>
    </svg>
  )
}
