import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, X } from 'lucide-react'
import { usePopover } from './use-popover'

const sampleNotifications = [
  {
    title: 'New in Discover',
    message: 'Meeting Notes Assistant has joined the catalogue.',
    time: 'Just now',
  },
  {
    title: 'Marketing picks',
    message: 'Browse agents for your next campaign.',
    time: '15 min ago',
  },
  {
    title: 'Productivity picks',
    message: 'Explore agents that help with everyday tasks.',
    time: '1 hour ago',
  },
  {
    title: 'Find your saved agents',
    message: 'Open Filters in Discover and choose Saved agents.',
    time: '2 hours ago',
  },
  {
    title: 'Popular this week',
    message: 'See which agents have the most reviews.',
    time: '4 hours ago',
  },
  {
    title: 'Compare agent listings',
    message: 'Switch to list view to browse descriptions in a single column.',
    time: 'Yesterday',
  },
  {
    title: 'Explore free agents',
    message: 'Use the pricing filters to narrow your search.',
    time: 'Yesterday',
  },
  {
    title: 'Get to know an agent',
    message: 'Open a listing to see what it does and who built it.',
    time: '2 days ago',
  },
  {
    title: 'Welcome to Relay',
    message: 'Discover agents for writing, sales, and more.',
    time: '2 days ago',
  },
]

export default function Notifications() {
  const { id, trigger, panel, open, style, toggle } = usePopover({ animate: true })
  const [allRead, setAllRead] = useState(false)
  const unreadCount = allRead ? 0 : sampleNotifications.length

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button notification"
        aria-label={open ? 'Close notifications' : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={style ? id : undefined}
        onClick={toggle}
      >
        <Bell className="notification-bell" size={20} aria-hidden="true" />
        <X className="notification-close" size={20} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount}
          </span>
        )}
      </button>
      {style &&
        createPortal(
          <section
            ref={panel}
            id={id}
            className="popover notification-panel"
            role="dialog"
            aria-labelledby={`${id}-title`}
            inert={!open}
            tabIndex={-1}
            style={style}
          >
            <div className="notification-panel-heading">
              <div>
                <h2 id={`${id}-title`}>Notifications</h2>
                <p aria-live="polite">
                  Sample updates ·{' '}
                  {allRead ? 'All read' : `${unreadCount} unread`}
                </p>
              </div>
              <button
                type="button"
                className="notification-read"
                disabled={allRead}
                onClick={() => {
                  panel.current?.focus({ preventScroll: true })
                  setAllRead(true)
                }}
              >
                Mark all as read
              </button>
            </div>
            <ul
              className="notification-list"
              role="list"
              tabIndex={0}
              aria-label="Sample notifications"
            >
              {sampleNotifications.map(({ title, message, time }) => (
                <li
                  key={title}
                  className={`notification-item${allRead ? '' : ' unread'}`}
                >
                  <h3>
                    {title}
                    {!allRead && (
                      <span className="notification-dot" aria-hidden="true" />
                    )}
                  </h3>
                  <p>{message}</p>
                  <span className="notification-time">{time}</span>
                </li>
              ))}
            </ul>
          </section>,
          document.body,
        )}
    </>
  )
}
