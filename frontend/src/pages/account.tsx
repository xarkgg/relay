import { toggleTheme, useTheme } from '../theme'

function AppearanceSetting() {
  const dark = useTheme() === 'dark'

  return (
    <section>
      <h2>Appearance</h2>
      <label className="appearance-option">
        <input type="checkbox" checked={dark} onChange={toggleTheme} />
        Dark mode
      </label>
    </section>
  )
}

export default function AccountPage({ page }: { page: 'profile' | 'settings' }) {
  return (
    <main className="privacy-page">
      <a className="privacy-back" href="/">
        ← Back to the marketplace
      </a>
      <h1>{page === 'profile' ? 'Profile' : 'Setting'}</h1>
      {page === 'profile' ? (
        <section>
          <h2>Guest profile</h2>
          <p>You&apos;re browsing Relay as a guest.</p>
        </section>
      ) : (
        <AppearanceSetting />
      )}
    </main>
  )
}
