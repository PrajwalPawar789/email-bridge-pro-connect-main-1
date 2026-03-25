import './index.css';
import { normalizeSiteConnectorHost, shouldResolveSiteDomainHost } from '@/lib/siteConnectorHost';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const host =
  typeof window === 'undefined'
    ? ''
    : normalizeSiteConnectorHost(window.location.host || window.location.hostname || '');

const bootstrap = shouldResolveSiteDomainHost(host)
  ? import('./custom-domain-entry')
  : import('./platform-entry');

void bootstrap.then(({ mount }) => {
  mount(rootElement);
});
