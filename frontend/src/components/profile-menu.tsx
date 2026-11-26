import { createPortal } from 'react-dom'
import { ChevronDown, LifeBuoy, Settings, UserRound } from 'lucide-react'
import { useHeaderPopover } from './use-header-popover'

const links = [
  { label: 'Profile', href: '/profile/', icon: UserRound },
  { label: 'Setting', href: '/settings/', icon: Settings },
  { label: 'Help & Support', href: '/privacy/#contact', icon: LifeBuoy },
]

export default function ProfileMenu() {
  const { id, trigger, panel, style, toggle } = useHeaderPopover()

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="profile"
        aria-label={style ? 'Close profile menu' : 'Open profile menu'}
        aria-haspopup="dialog"
        aria-expanded={style !== null}
        aria-controls={style ? id : undefined}
        onClick={toggle}
      >
        <img src="/placeholder-user.jpg" alt="" />
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {style &&
        createPortal(
          <section
            ref={panel}
            id={id}
            className="header-popover profile-menu"
            role="dialog"
            aria-label="Profile menu"
            tabIndex={-1}
            style={style}
          >
            <nav aria-label="Account navigation">
              {links.map(({ label, href, icon: Icon }) => (
                <a key={href} href={href}>
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </a>
              ))}
            </nav>
          </section>,
          document.body,
        )}
    </>
  )
}
