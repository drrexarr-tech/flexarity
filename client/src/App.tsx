import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useVisualViewportInsets } from '@/lib/useVisualViewport';
import { isPushActive, enablePush } from '@/lib/push';
import { useThemeStore } from '@/stores/themeStore';
import { useNavStore } from '@/stores/navStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RecipesPage } from '@/pages/RecipesPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { TasksPage } from '@/pages/TasksPage';
import { FamilyPage } from '@/pages/FamilyPage';
import { ChatsPage } from '@/pages/ChatsPage';
import { NotesPage } from '@/pages/NotesPage';
import { PlansPage } from '@/pages/PlansPage';
import { PlanDetailPage } from '@/pages/PlanDetailPage';
import { WishesPage } from '@/pages/WishesPage';
import { WishlistDetailPage } from '@/pages/WishlistDetailPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { ShoppingPage } from '@/pages/ShoppingPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { InvitePage } from '@/pages/InvitePage';
import { OAuthHandler } from '@/components/layout/OAuthHandler';
import { PageTransition } from '@/components/layout/PageTransition';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  if (!isInitialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * A tap on a push notification asks the worker to focus an open window and then
 * sends it a route. The worker cannot navigate a client it does not own, so the
 * handler lives here where the router is.
 *
 * Re-registering after every load is deliberate: permission can be granted on a
 * second device while this one already had it, and a subscription that is not
 * re-sent to the server is one the server has never heard of.
 */
function usePushNavigation() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'navigate' && typeof event.data.link === 'string') {
        navigate(event.data.link);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      if (await isPushActive()) {
        // Already subscribed: make sure the server still has this endpoint under
        // the account that is signed in now.
        try {
          const { currentSubscription } = await import('@/lib/push');
          const sub = await currentSubscription();
          const json = sub?.toJSON() as any;
          if (json?.endpoint && json?.keys && !cancelled) {
            const { api } = await import('@/lib/api');
            await api.push.subscribe({ endpoint: json.endpoint, keys: json.keys });
          }
        } catch {
          /* a failed re-register must not surface on the home screen */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);
}

function AnimatedRoutes() {
  const location = useLocation();

  // Every navigation and every full reload must start at the top. Without this
  // the browser restores the previous offset and, combined with scroll
  // anchoring, the page creeps further down on every reload.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/family/invite" element={<InvitePage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<PageTransition><DashboardPage /></PageTransition>} />
          <Route path="/recipes" element={<PageTransition><RecipesPage /></PageTransition>} />
          <Route path="/recipes/:id" element={<PageTransition><RecipeDetailPage /></PageTransition>} />
          <Route path="/tasks" element={<PageTransition><TasksPage /></PageTransition>} />
          <Route path="/family" element={<PageTransition><FamilyPage /></PageTransition>} />
          <Route path="/chats" element={<PageTransition><ChatsPage /></PageTransition>} />
          <Route path="/chats/:chatId" element={<PageTransition><ChatsPage /></PageTransition>} />
          <Route path="/notes" element={<PageTransition><NotesPage /></PageTransition>} />
          <Route path="/plans" element={<PageTransition><PlansPage /></PageTransition>} />
          <Route path="/plans/:id" element={<PageTransition><PlanDetailPage /></PageTransition>} />
          <Route path="/wishes" element={<PageTransition><WishesPage /></PageTransition>} />
          <Route path="/wishes/:id" element={<PageTransition><WishlistDetailPage /></PageTransition>} />
          <Route path="/calendar" element={<PageTransition><CalendarPage /></PageTransition>} />
          <Route path="/shopping" element={<PageTransition><ShoppingPage /></PageTransition>} />
          <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);
  const initNav = useNavStore((s) => s.init);

  // Publishes the keyboard inset once, so every sheet in the app can sit above
  // it rather than underneath.
  useVisualViewportInsets();

  usePushNavigation();

  useEffect(() => {
    initAuth();
    initTheme();
    // Without this the bottom bar renders the defaults for one frame and then
    // swaps to the user's own order, which reads as the menu jumping on load.
    initNav();
    // Take over reload scrolling: 'auto' lets the browser restore a stale
    // offset, which fights the reset in AnimatedRoutes.
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <OfflineBanner />
        <OAuthHandler />
        <Toaster
          position="top-right"
          toastOptions={{
            className: '!bg-card !text-card-foreground !border !border-border',
          }}
        />
        <AnimatedRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
