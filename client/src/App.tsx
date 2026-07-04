import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RecipesPage } from '@/pages/RecipesPage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { TasksPage } from '@/pages/TasksPage';
import { FamilyPage } from '@/pages/FamilyPage';
import { ChatsPage } from '@/pages/ChatsPage';
import { NotesPage } from '@/pages/NotesPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { PageTransition } from '@/components/layout/PageTransition';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
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
          <Route path="/profile" element={<PageTransition><ProfilePage /></PageTransition>} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const initAuth = useAuthStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);

  useEffect(() => {
    initAuth();
    initTheme();
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          className: '!bg-card !text-card-foreground !border !border-border',
        }}
      />
      <AnimatedRoutes />
    </BrowserRouter>
  );
}
