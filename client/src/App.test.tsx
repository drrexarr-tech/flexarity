import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import App from '@/App';

/**
 * These are render tests, not snapshots: the failure they exist to catch is a
 * hook used outside the provider that supplies it, which throws during render
 * and takes the whole tree with it.
 *
 * Every check below passed on the deploy where the site was white. The bundle
 * built, the asset hashed names matched, the API answered 200, and the service
 * worker registered. Nothing ran React, so nothing noticed that useNavigate()
 * was called one level above BrowserRouter - and ErrorBoundary, being rendered
 * by that very component, could not catch a throw from its own render.
 */

function renderApp() {
  return render(<App />);
}

describe('the app mounts', () => {
  it('renders without throwing', () => {
    expect(() => renderApp()).not.toThrow();
  });

  it('reaches a route: either the login screen or the app shell', async () => {
    renderApp();
    await waitFor(() => {
      const hasShell = !!document.querySelector('nav, [role="navigation"], aside');
      const hasLogin = document.body.textContent?.toLowerCase().includes('вход') ||
        document.body.textContent?.toLowerCase().includes('почта');
      expect(hasShell || hasLogin).toBe(true);
    });
  });

  it('does not leave an error boundary on screen', async () => {
    renderApp();
    await waitFor(() => {
      const text = document.body.textContent || '';
      expect(/Что-то пошло не так|Unexpected error|Application error/i.test(text)).toBe(false);
    });
  });
});

describe('router hooks stay inside the router', () => {
  // The regression this file was written for, stated directly.
  it('App itself uses no router hook', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8'),
    );
    const appBody = source.slice(source.indexOf('export default function App('));
    expect(appBody).not.toMatch(/useNavigate\(|useLocation\(|useParams\(|useSearchParams\(/);
    expect(appBody).not.toMatch(/usePushNavigation\(/);
  });

  it('the push navigation helper is rendered inside BrowserRouter', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8'),
    );
    const routerAt = source.indexOf('<BrowserRouter>');
    const helperAt = source.indexOf('<PushNavigation />');
    expect(routerAt).toBeGreaterThan(-1);
    expect(helperAt).toBeGreaterThan(routerAt);
  });
});