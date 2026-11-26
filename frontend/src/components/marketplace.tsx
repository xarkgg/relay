import { Avatar, Style } from '@dicebear/core'
import bottts from '@dicebear/styles/bottts.json' with { type: 'json' }
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Compass,
  Funnel,
  Heart,
  LayoutGrid,
  MessageCircleQuestionMark,
  Moon,
  ReceiptText,
  Search,
  Send,
  Star,
  Sun,
  TextAlignStart,
  X,
} from 'lucide-react'
import { toggleTheme, useTheme } from '../theme'
import AgentSearch from './agent-search'
import Notifications from './notifications'
import ProfileMenu from './profile-menu'
import SortMenu, { type AgentSort } from './sort-menu'
import { usePopover } from './use-popover'

type Agent = {
  title: string
  description: string
  rating: string
  reviews: string
  author: string
  initials: string
  category: string
  pricing: 'Free' | 'Paid' | 'Premium'
  avatarUrl: string
  score: number
}

const agentListings: Omit<Agent, 'avatarUrl'>[] = [
  {
    title: 'Buyer Persona Builder',
    description:
      "Most messaging fails because it's written for a generic buyer. This agent helps you define who you're really talking to.",
    rating: '4.39',
    reviews: '1.4K',
    author: 'Shaalin Parekh',
    initials: 'SP',
    category: 'Marketing',
    pricing: 'Premium',
    score: 94,
  },
  {
    title: 'HubSpot App Marketplace Scout',
    description:
      'This agent evaluates your HubSpot App Marketplace listing and helps you grow your reach.',
    rating: '4.32',
    reviews: '1.2K',
    author: 'Hugh Durkin',
    initials: 'HD',
    category: 'CRM',
    pricing: 'Premium',
    score: 91,
  },
  {
    title: 'Domain Idea Generator',
    description:
      'Generate domain ideas and provide data on which ones are available for your next big idea.',
    rating: '4.40',
    reviews: '2.4K',
    author: 'Arlene McCoy',
    initials: 'AM',
    category: 'Productivity',
    pricing: 'Paid',
    score: 89,
  },
  {
    title: 'Prospect Research by Sell',
    description:
      'Walk into every meeting armed with your prospect’s own words and the context that matters.',
    rating: '4.30',
    reviews: '1.6K',
    author: 'Cody Fisher',
    initials: 'CF',
    category: 'Sales',
    pricing: 'Free',
    score: 86,
  },
  {
    title: 'Video Script Generator',
    description:
      'Creates engaging scripts for various types of video content, such as product demos and social clips.',
    rating: '4.39',
    reviews: '1.4K',
    author: 'Darlene Robertson',
    initials: 'DR',
    category: 'Writing & Content',
    pricing: 'Premium',
    score: 84,
  },
  {
    title: 'Recent LinkedIn Post',
    description:
      'This agent summarizes the latest posts from a number of LinkedIn creators you follow.',
    rating: '4.39',
    reviews: '1.4K',
    author: 'Brooklyn Simmons',
    initials: 'BS',
    category: 'Marketing',
    pricing: 'Paid',
    score: 82,
  },
  {
    title: 'Build Your Brand DNA',
    description:
      'This agent helps you build your brand foundation by defining your voice and values.',
    rating: '4.39',
    reviews: '1.4K',
    author: 'Eleanor Pena',
    initials: 'EP',
    category: 'Marketing',
    pricing: 'Premium',
    score: 79,
  },
  {
    title: 'Meme Maker',
    description:
      'Automatically generates funny, on-trend memes by picking the right format and caption.',
    rating: '4.39',
    reviews: '1.4K',
    author: 'Leslie Alexander',
    initials: 'LA',
    category: 'Other',
    pricing: 'Free',
    score: 77,
  },
  {
    title: 'Customer Success Companion',
    description:
      'Keep every customer conversation thoughtful, timely, and focused on the next best step.',
    rating: '4.28',
    reviews: '986',
    author: 'Marvin McKinney',
    initials: 'MM',
    category: 'Customer Service',
    pricing: 'Free',
    score: 75,
  },
  {
    title: 'Campaign Copy Studio',
    description:
      'Draft clear campaign concepts and polished copy for every channel in your launch.',
    rating: '4.36',
    reviews: '812',
    author: 'Esther Howard',
    initials: 'EH',
    category: 'Marketing',
    pricing: 'Paid',
    score: 72,
  },
  {
    title: 'Meeting Notes Assistant',
    description:
      'Turn long meetings into clean summaries, decisions, and action items your team can use.',
    rating: '4.31',
    reviews: '730',
    author: 'Jenny Wilson',
    initials: 'JW',
    category: 'Productivity',
    pricing: 'Free',
    score: 70,
  },
  {
    title: 'Sales Email Coach',
    description:
      'Improve your outreach with concise, personal emails built around your prospect’s needs.',
    rating: '4.26',
    reviews: '654',
    author: 'Robert Fox',
    initials: 'RF',
    category: 'Sales',
    pricing: 'Premium',
    score: 68,
  },
]

const avatarStyle = new Style(bottts)
const avatarBackgrounds = [
  '#dbeafe',
  '#dcfce7',
  '#fef3c7',
  '#ede9fe',
  '#fce7f3',
  '#cffafe',
]
const agents: Agent[] = agentListings.map((agent) => ({
  ...agent,
  avatarUrl: new Avatar(avatarStyle, {
    // The catalogue uses agent titles as keys, including for saved agents.
    seed: agent.title,
    size: 128,
    scale: 0.9,
    backgroundColor: avatarBackgrounds,
  }).toDataUri(),
}))

const categories: [string, string][] = [
  ['Marketing', '1,425'],
  ['Productivity', '1,105'],
  ['Sales', '656'],
  ['Customer Service', '513'],
  ['Other', '365'],
  ['CRM', '256'],
  ['Writing & Content', '145'],
].map(([category]) => [
  category,
  String(agents.filter((agent) => agent.category === category).length),
])
const sections = [
  'Team',
  'Agent Type',
  'Integrations',
  'Author',
  'Rating',
  'Publish Date',
]
const nav = [
  { label: 'Discover', icon: Compass },
  { label: 'My Hires', icon: BriefcaseBusiness },
  { label: 'Activity', icon: Activity },
  { label: 'Transactions', icon: ReceiptText },
  { label: 'Ask Relay', icon: MessageCircleQuestionMark },
]

function CheckGroup({
  title,
  options,
  selected,
  onToggle,
  defaultOpen = false,
  disabled = false,
}: {
  title: string
  options: [string, string][]
  selected: string[]
  onToggle: (value: string) => void
  defaultOpen?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="filter-section">
      <button
        className="filter-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {title}
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open && (
        <div className="filter-options">
          {options.map(([label, count]) => (
            <label className="filter-option" key={label}>
              <input
                type="checkbox"
                aria-label={label}
                disabled={disabled}
                title={
                  disabled ? 'Backend data is not connected yet' : undefined
                }
                checked={selected.includes(label)}
                onChange={() => onToggle(label)}
              />
              <span>{label}</span>
              <span className="filter-count">{count}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

function Header() {
  const [active, setActive] = useState(nav[0].label)
  const dark = useTheme() === 'dark'
  return (
    <header className={`topbar ${dark ? 'dark-mode' : ''}`}>
      <a className="brand" href="#top" aria-label="Relay home">
        <img
          className="brand-wordmark brand-wordmark--light"
          src="/wordmark-white.png"
          width={1600}
          height={500}
          alt=""
        />
        <img
          className="brand-wordmark brand-wordmark--dark"
          src="/wordmark-black.png"
          width={1600}
          height={500}
          alt=""
        />
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        {nav.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={active === label ? 'nav-item active' : 'nav-item'}
            onClick={() => setActive(label)}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button
          className="icon-button theme-button"
          aria-label="Toggle color theme"
          aria-pressed={dark}
          onClick={toggleTheme}
        >
          <Sun className="theme-icon--light" size={20} aria-hidden="true" />
          <Moon className="theme-icon--dark" size={20} aria-hidden="true" />
        </button>
        <Notifications />
        <span className="header-divider" />
        <ProfileMenu />
      </div>
    </header>
  )
}

function AgentCard({
  agent,
  saved,
  onSave,
  onOpen,
}: {
  agent: Agent
  saved: boolean
  onSave: () => void
  onOpen: () => void
}) {
  return (
    <article className="agent-card">
      <div className="card-banner">
        <span className="pricing-badge">{agent.pricing}</span>
      </div>
      <img
        className="agent-emblem"
        src={agent.avatarUrl}
        alt=""
        decoding="async"
      />
      <div className="card-content">
        <h2 title={agent.title}>{agent.title}</h2>
        <p className="agent-description">{agent.description}</p>
        <div className="rating">
          <Star size={17} fill="currentColor" strokeWidth={1} />
          <span>
            {agent.rating} ({agent.reviews})
          </span>
        </div>
        <div className="author">
          <span className="avatar" aria-hidden="true">
            {agent.initials}
          </span>
          <span>{agent.author}</span>
        </div>
        <div className="card-actions">
          <button
            className="go-button"
            onClick={onOpen}
            aria-label={`Open ${agent.title}`}
          >
            <Send size={15} fill="currentColor" />
            Go
          </button>
          <button
            className={`save-button ${saved ? 'saved' : ''}`}
            onClick={onSave}
            aria-label={
              saved
                ? `Remove ${agent.title} from saved agents`
                : `Save ${agent.title}`
            }
            aria-pressed={saved}
          >
            <Heart size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </article>
  )
}

function AgentDetails({
  agent,
  onClose,
}: {
  agent: Agent
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => node?.close()
  }, [agent])

  return (
    <dialog
      ref={dialog}
      className="agent-dialog"
      aria-labelledby="dialog-title"
      onClose={(event) => {
        // Ignore a stale close event from React Strict Mode's effect cleanup if
        // the dialog has already reopened for the active preview.
        if (!event.currentTarget.open) onClose()
      }}
    >
      <button
        className="dialog-close"
        aria-label="Close agent details"
        onClick={() => dialog.current?.close()}
      >
        <X size={20} />
      </button>
      <img className="dialog-avatar" src={agent.avatarUrl} alt="" />
      <span className="dialog-kicker">
        {agent.pricing} agent · {agent.category}
      </span>
      <h2 id="dialog-title">{agent.title}</h2>
      <p>{agent.description}</p>
      <div className="dialog-meta">
        <span>
          <Star size={16} fill="currentColor" /> {agent.rating} ({agent.reviews}{' '}
          reviews)
        </span>
        <span>Built by {agent.author}</span>
      </div>
      <p className="dialog-preview-note">
        Sample listing. Agent launches and Pi checkout are not connected yet.
      </p>
      <button className="dialog-launch" disabled>
        <Send size={15} fill="currentColor" /> Launch coming soon
      </button>
    </dialog>
  )
}

const reviewCount = (value: string) =>
  parseFloat(value) * (value.endsWith('K') ? 1000 : 1)

export default function Marketplace() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [sort, setSort] = useState<AgentSort>('Relevance')
  const [saved, setSaved] = useState<string[]>([])
  const [listView, setListView] = useState(false)
  const filters = usePopover({ dismissOnScroll: false })
  const [showSaved, setShowSaved] = useState(false)
  const [openedAgent, setOpenedAgent] = useState<Agent | null>(null)
  const toggle = (value: string) =>
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    )
  const visibleAgents = useMemo(() => {
    const term = query.trim().toLowerCase()
    const filtered = agents.filter((agent) => {
      const matchesQuery =
        !term ||
        `${agent.title} ${agent.description} ${agent.category} ${agent.author}`
          .toLowerCase()
          .includes(term)
      const matchesCategory =
        !selected.some((value) =>
          categories.some(([category]) => category === value),
        ) || selected.includes(agent.category)
      const matchesPricing =
        !selected.some((value) =>
          ['Free', 'Paid', 'Premium'].includes(value),
        ) || selected.includes(agent.pricing)
      const savedFilter = !showSaved || saved.includes(agent.title)
      return matchesQuery && matchesCategory && matchesPricing && savedFilter
    })
    if (sort === 'Top rated')
      return filtered.sort((a, b) => Number(b.rating) - Number(a.rating))
    if (sort === 'Most popular')
      return filtered.sort(
        (a, b) => reviewCount(b.reviews) - reviewCount(a.reviews),
      )
    return filtered
  }, [query, selected, sort, showSaved, saved])
  const toggleSave = (title: string) =>
    setSaved((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    )
  const clearAll = () => {
    setQuery('')
    setSelected([])
    setShowSaved(false)
    setSort('Relevance')
  }

  return (
    <div className="app-shell" id="top">
      <Header />
      <main className="workspace">
        <div className="search-row">
          <AgentSearch
            query={query}
            onQueryChange={setQuery}
            suggestions={visibleAgents}
          />
          <button
            ref={filters.trigger}
            type="button"
            className="icon-button filter-toggle"
            aria-label="Show filters"
            aria-haspopup="dialog"
            aria-controls={filters.id}
            aria-expanded={filters.open}
            onClick={filters.toggle}
          >
            <Funnel size={20} aria-hidden="true" />
          </button>
        </div>
        <section
          ref={filters.panel}
          id={filters.id}
          className="popover filters-popover"
          role="dialog"
          aria-labelledby={`${filters.id}-title`}
          tabIndex={-1}
          hidden={filters.style === null}
          style={filters.style ?? undefined}
        >
          <div className="filter-top">
            <h2 id={`${filters.id}-title`}>Filters</h2>
            <button
              type="button"
              className="collapse-button"
              aria-label="Close filters"
              onClick={filters.close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="filter-actions">
            <button
              type="button"
              aria-pressed={showSaved}
              onClick={() => {
                setShowSaved(!showSaved)
                filters.close()
              }}
            >
              <Heart size={15} aria-hidden="true" /> Saved agents
            </button>
            <button
              type="button"
              aria-pressed={sort === 'Top rated'}
              onClick={() => {
                setSort('Top rated')
                filters.close()
              }}
            >
              <Star size={15} aria-hidden="true" /> Top rated
            </button>
          </div>
          <CheckGroup
            title="Category"
            options={categories}
            selected={selected}
            onToggle={toggle}
            defaultOpen
          />
          <div className="compact-filters">
            {sections.slice(0, 3).map((section) => (
              <CheckGroup
                key={section}
                title={section}
                options={
                  section === 'Agent Type'
                    ? [
                        ['Autonomous', '842'],
                        ['Assistant', '786'],
                        ['Workflow', '531'],
                      ]
                    : section === 'Integrations'
                      ? [
                          ['HubSpot', '124'],
                          ['Slack', '98'],
                          ['Notion', '76'],
                        ]
                      : [
                          ['Individual', '1,094'],
                          ['Team', '884'],
                          ['Enterprise', '471'],
                        ]
                }
                selected={selected}
                onToggle={toggle}
                disabled
              />
            ))}
          </div>
          <CheckGroup
            title="Pricing"
            options={[
              [
                'Free',
                String(
                  agents.filter((agent) => agent.pricing === 'Free').length,
                ),
              ],
              [
                'Paid',
                String(
                  agents.filter((agent) => agent.pricing === 'Paid').length,
                ),
              ],
              [
                'Premium',
                String(
                  agents.filter((agent) => agent.pricing === 'Premium').length,
                ),
              ],
            ]}
            selected={selected}
            onToggle={toggle}
            defaultOpen
          />
          <div className="compact-filters">
            {sections.slice(3).map((section) => (
              <CheckGroup
                key={section}
                title={section}
                options={
                  section === 'Rating'
                    ? [
                        ['4+ stars', '1,028'],
                        ['3+ stars', '1,604'],
                      ]
                    : section === 'Publish Date'
                      ? [
                          ['This week', '84'],
                          ['This month', '305'],
                        ]
                      : [
                          ['Featured authors', '226'],
                          ['Verified builders', '814'],
                        ]
                }
                selected={selected}
                onToggle={toggle}
                disabled
              />
            ))}
          </div>
          <button className="clear-button" onClick={clearAll}>
            Clear All Filters
          </button>
        </section>
        <section className="content-area">
          <section className="results-panel">
            <div className="results-toolbar">
              <div className="results-count">
                <strong>{visibleAgents.length}</strong>
                <span>Agents</span>
                {showSaved && (
                  <button
                    className="clear-saved"
                    onClick={() => setShowSaved(false)}
                  >
                    Clear saved view <X size={13} />
                  </button>
                )}
              </div>
              <div className="result-controls">
                <SortMenu value={sort} onChange={setSort} />
                <button
                  className={`view-button ${!listView ? 'view-active' : ''}`}
                  aria-label="Grid view"
                  aria-pressed={!listView}
                  onClick={() => setListView(false)}
                >
                  <LayoutGrid size={21} aria-hidden="true" />
                </button>
                <button
                  className={`view-button ${listView ? 'view-active' : ''}`}
                  aria-label="List view"
                  aria-pressed={listView}
                  onClick={() => setListView(true)}
                >
                  <TextAlignStart size={21} aria-hidden="true" />
                </button>
              </div>
            </div>
            {visibleAgents.length ? (
              <div className={`agent-grid ${listView ? 'list-view' : ''}`}>
                {visibleAgents.map((agent) => (
                  <AgentCard
                    key={agent.title}
                    agent={agent}
                    saved={saved.includes(agent.title)}
                    onSave={() => toggleSave(agent.title)}
                    onOpen={() => setOpenedAgent(agent)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={28} />
                <strong>No agents found</strong>
                <span>Try another search or clear your filters.</span>
                <button onClick={clearAll}>Clear filters</button>
              </div>
            )}
          </section>{' '}
        </section>
      </main>
      <footer className="preview-footer">
        <p>
          Design preview · Sample listings. Pi login, checkout, publishing and
          agent launches are not connected yet.
        </p>
        <a href="/privacy/">Privacy &amp; limits</a>
      </footer>
      {openedAgent && (
        <AgentDetails
          agent={openedAgent}
          onClose={() => setOpenedAgent(null)}
        />
      )}
    </div>
  )
}
