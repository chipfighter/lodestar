// Copying another platform's Agents or categories here, one at a time or all at once: each platform
// keeps its own, and a copy brings over as much as this platform has.

import { Button, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, type ButtonProps } from '@fluentui/react-components'
import { Copy20Regular } from '@fluentui/react-icons'

import { useStrings } from '../i18n'
import { PLATFORMS, PlatformLogo, type Platform } from './platform'

/** Something to copy: its name, how many skills it brings here, and whether a same-named one is here already. */
export type CopyItem = { name: string; size: number; isHere: boolean }

/** A platform's name, as the picker shows it. */
export function platformName(platform: Platform): string {
  return PLATFORMS.find(one => one.id === platform)?.name ?? platform
}

/**
 * "Copy … from …": a menu of the other platform's items, each saying how many of its skills this
 * platform has, which is what a copy brings (no skill is installed). One with none can't be picked;
 * "Copy all" takes the ones that bring something and aren't here yet.
 */
export function CopyMenu({
  from,
  to,
  label,
  items,
  onCopy,
  appearance = 'subtle',
  className,
}: {
  from: Platform
  to: Platform
  label: string
  items: readonly CopyItem[]
  onCopy: (names: string[]) => void
  appearance?: ButtonProps['appearance']
  className?: string
}) {
  const strings = useStrings()
  const here = platformName(to)
  const all = items.filter(item => item.size > 0 && !item.isHere).map(item => item.name)

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button className={className} appearance={appearance} icon={<PlatformLogo platform={from} size={16} />}>
          {label}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {items.map(item => (
            <MenuItem
              key={item.name}
              disabled={item.size === 0}
              secondaryContent={
                item.size === 0 ? strings.copyNoneIn(here) : item.isHere ? strings.copySameNameIn(here) : strings.copyHas(here, item.size)
              }
              onClick={() => onCopy([item.name])}
            >
              {item.name}
            </MenuItem>
          ))}
          {all.length > 1 ? (
            <>
              <MenuDivider />
              <MenuItem icon={<Copy20Regular />} onClick={() => onCopy(all)}>
                {strings.copyAll(all.length)}
              </MenuItem>
            </>
          ) : null}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}
