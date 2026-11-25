import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bell,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Command,
  Dna,
  Flame,
  Globe2,
  Grid2X2,
  Heart,
  List,
  Menu,
  Moon,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Users,
  X,
} from 'lucide-react'

type Agent = {
  title: string
  description: string
  rating: string
  reviews: string
  author: string
  initials: string
  category: string
  pricing: 'Free' | 'Paid' | 'Premium'
  icon: string
  score: number
}

const agents: Agent[] = [
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
    icon: 'users',
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
    icon: 'bot',
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
    icon: 'globe',
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
    icon: 'controls',
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
    icon: 'video',
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
    icon: 'linkedin',
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
    icon: 'dna',
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
    icon: 'sparkles',
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
    icon: '◉',
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
    icon: '✳',
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
    icon: '▤',
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
    icon: '✉',
    score: 68,
  },
]

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
  'Agent Network',
  'Builder Network',
  'Leaderboard',
  'Blog',
  'Pricing',
  'Agent Builder',
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
  const [active, setActive] = useState('Agent Network')
  const [dark, setDark] = useState(false)
  return (
    <header className={`topbar ${dark ? 'dark-mode' : ''}`}>
      <a className="brand" href="#top" aria-label="AI Agents Marketplace home">
        <span className="brand-mark">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path d="M8 36 14 10l19 5 8-8M14 10l13 16 6-11M8 36l19-10 14-19M8 36l4-2 15 2 14-19-14-1M14 10l-2 24" />
            <circle cx="8" cy="36" r="3.7" />
            <circle cx="14" cy="10" r="3.7" />
            <circle cx="33" cy="15" r="3.7" />
            <circle cx="41" cy="7" r="3.7" />
            <circle cx="27" cy="26" r="3.7" />
          </svg>
        </span>
        <span className="brand-text">
          <strong>AI Agents</strong>
          <small>Marketplace</small>
        </span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        {nav.map((item) => (
          <button
            key={item}
            className={active === item ? 'nav-item active' : 'nav-item'}
            onClick={() => setActive(item)}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <button
          className="icon-button theme-button"
          aria-label="Toggle color theme"
          onClick={() => setDark(!dark)}
        >
          {dark ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <button className="icon-button notification" aria-label="Notifications">
          <Bell size={20} />
          <span>9</span>
        </button>
        <span className="header-divider" />
        <button className="profile" aria-label="Open profile menu">
          <img src="/placeholder-user.jpg" alt="Profile" />
          <ChevronDown size={16} />
        </button>
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
  const Icon =
    agent.icon === 'users'
      ? Users
      : agent.icon === 'globe'
        ? Globe2
        : agent.icon === 'controls'
          ? SlidersHorizontal
          : agent.icon === 'video' || agent.icon === 'linkedin'
            ? Activity
            : agent.icon === 'dna'
              ? Dna
              : agent.icon === 'sparkles'
                ? Sparkles
                : Bot
  return (
    <article className="agent-card">
      <div className="card-banner">
        <span className="pricing-badge">{agent.pricing}</span>
      </div>
      <div className="agent-emblem" aria-hidden="true">
        <Icon size={30} strokeWidth={1.8} />
      </div>
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
      <div className="dialog-icon">
        <Bot size={30} />
      </div>
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
  const [sort, setSort] = useState('Relevance')
  const [saved, setSaved] = useState<string[]>([])
  const [listView, setListView] = useState(false)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [activeChip, setActiveChip] = useState('')
  const [extraOpen, setExtraOpen] = useState(false)
  const [openedAgent, setOpenedAgent] = useState<Agent | null>(null)
  const toggle = (value: string) =>
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    )
  const visibleAgents = useMemo(() => {
    const filtered = agents.filter((agent) => {
      const term = query.trim().toLowerCase()
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
      const savedFilter =
        activeChip !== 'Saved agents' || saved.includes(agent.title)
      return matchesQuery && matchesCategory && matchesPricing && savedFilter
    })
    if (sort === 'Top rated')
      return filtered.sort((a, b) => Number(b.rating) - Number(a.rating))
    if (sort === 'Most popular')
      return filtered.sort(
        (a, b) => reviewCount(b.reviews) - reviewCount(a.reviews),
      )
    return filtered
  }, [query, selected, sort, activeChip, saved])
  const toggleSave = (title: string) =>
    setSaved((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    )
  const chips = [
    { label: 'Hot Right Now', icon: Flame },
    { label: 'New & Noteworthy', icon: Star },
    { label: 'Included with Pro', icon: Sparkles },
    { label: 'Sales & Marketing Agents', icon: Activity },
    { label: 'Agents for Sales Prospecting', icon: Users },
  ]
  const toggleChip = (chip: string) => {
    const key = chip.includes('Sales & Marketing')
      ? 'Marketing'
      : chip.includes('Prospecting')
        ? 'Sales'
        : chip.includes('Pro')
          ? 'Premium'
          : chip.includes('Saved')
            ? 'Saved agents'
            : chip.includes('Hot')
              ? 'Most popular'
              : 'New & Noteworthy'
    setActiveChip(activeChip === key ? '' : key)
    if (key === 'Marketing' || key === 'Sales' || key === 'Premium') toggle(key)
    if (key === 'Most popular')
      setSort(sort === 'Most popular' ? 'Relevance' : 'Most popular')
  }
  const clearAll = () => {
    setSelected([])
    setQuery('')
    setActiveChip('')
    setSort('Relevance')
  }

  return (
    <div className="app-shell" id="top">
      <Header />
      <main className="workspace">
        <aside
          className={`filter-panel ${mobileFilters ? 'filters-open' : ''}`}
        >
          <div className="filter-top">
            <h1>Filters</h1>
            <button
              className="collapse-button"
              aria-label="Close filters"
              onClick={() => setMobileFilters(false)}
            >
              <ChevronLeft size={18} />
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
        </aside>
        <section className="content-area">
          <div className="search-row">
            <label className="search-box">
              <Search size={22} />
              <input
                aria-label="Search agents"
                placeholder="Search agents, use cases, categories"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="shortcut">
                <Command size={13} /> K
              </span>
            </label>
            <button
              className="icon-button filter-toggle"
              aria-label="Show filters"
              onClick={() => setMobileFilters(!mobileFilters)}
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
          <div className="chips-row">
            <div
              className="quick-filters"
              role="group"
              aria-label="Quick agent filters"
            >
              {chips.map(({ label, icon: ChipIcon }) => (
                <button
                  key={label}
                  onClick={() => toggleChip(label)}
                  className={`chip ${activeChip && ((label.includes('Sales & Marketing') && activeChip === 'Marketing') || (label.includes('Prospecting') && activeChip === 'Sales') || (label.includes('Pro') && activeChip === 'Premium') || (label.includes('Hot') && activeChip === 'Most popular')) ? 'selected' : ''}`}
                >
                  <ChipIcon size={15} strokeWidth={1.8} />
                  {label}
                </button>
              ))}
            </div>
            <div className="more-wrap">
              <button
                className={`chip more-chip ${extraOpen ? 'selected' : ''}`}
                onClick={() => setExtraOpen(!extraOpen)}
              >
                More <ChevronDown size={17} />
              </button>
              {extraOpen && (
                <div className="more-menu">
                  <button
                    onClick={() => {
                      setActiveChip('Saved agents')
                      setExtraOpen(false)
                    }}
                  >
                    <Heart size={15} /> Saved agents
                  </button>
                  <button
                    onClick={() => {
                      setSort('Top rated')
                      setExtraOpen(false)
                    }}
                  >
                    <Star size={15} /> Top rated
                  </button>
                </div>
              )}
            </div>
          </div>
          <section className="results-panel">
            <div className="results-toolbar">
              <div className="results-count">
                <strong>{visibleAgents.length}</strong>
                <span>Agents</span>
                {activeChip === 'Saved agents' && (
                  <button
                    className="clear-saved"
                    onClick={() => setActiveChip('')}
                  >
                    Clear saved view <X size={13} />
                  </button>
                )}
              </div>
              <div className="result-controls">
                <label className="sort-label">
                  Sort by:{' '}
                  <select
                    aria-label="Sort agents"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option>Relevance</option>
                    <option>Top rated</option>
                    <option>Most popular</option>
                  </select>
                </label>
                <button
                  className={`view-button ${!listView ? 'view-active' : ''}`}
                  aria-label="Grid view"
                  aria-pressed={!listView}
                  onClick={() => setListView(false)}
                >
                  <Grid2X2 size={21} />
                </button>
                <button
                  className={`view-button ${listView ? 'view-active' : ''}`}
                  aria-label="List view"
                  aria-pressed={listView}
                  onClick={() => setListView(true)}
                >
                  <List size={21} />
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
      <button
        className="mobile-menu"
        aria-label="Open filters"
        onClick={() => setMobileFilters(!mobileFilters)}
      >
        <Menu size={21} />
      </button>
    </div>
  )
}
