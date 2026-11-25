import MarketplacePage from './pages/marketplace'
import PrivacyPage from './pages/privacy'
import NotFound from './pages/not-found'

export function pageForPath(pathname: string) {
  if (pathname === '/' || pathname === '/index.html') return 'marketplace'
  if (['/privacy', '/privacy/', '/privacy/index.html'].includes(pathname))
    return 'privacy'
  return 'not-found'
}

export default function App({ pathname }: { pathname: string }) {
  switch (pageForPath(pathname)) {
    case 'marketplace':
      return <MarketplacePage />
    case 'privacy':
      return <PrivacyPage />
    default:
      return <NotFound />
  }
}
