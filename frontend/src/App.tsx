import MarketplacePage from './pages/marketplace'
import AccountPage from './pages/account'
import PrivacyPage from './pages/privacy'
import NotFound from './pages/not-found'

export function pageForPath(pathname: string) {
  if (pathname === '/' || pathname === '/index.html') return 'marketplace'
  if (['/privacy', '/privacy/', '/privacy/index.html'].includes(pathname))
    return 'privacy'
  if (['/profile', '/profile/', '/profile/index.html'].includes(pathname))
    return 'profile'
  if (['/settings', '/settings/', '/settings/index.html'].includes(pathname))
    return 'settings'
  return 'not-found'
}

export default function App({ pathname }: { pathname: string }) {
  const page = pageForPath(pathname)
  switch (page) {
    case 'marketplace':
      return <MarketplacePage />
    case 'privacy':
      return <PrivacyPage />
    case 'profile':
    case 'settings':
      return <AccountPage page={page} />
    default:
      return <NotFound />
  }
}
