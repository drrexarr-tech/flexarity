import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, SidebarToggle } from './Sidebar';
import { NotificationBell } from './NotificationBell';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    // dvh instead of vh: on mobile 100vh includes the URL bar, so a vh-based
    // min-height always leaves a few pixels of scroll even on an empty page.
    <div className="flex min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-dvh w-full flex-col lg:ml-64 lg:pb-0 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        {/* safe-area-top, and min-h rather than h: in a standalone PWA there is
            no browser bar to cover the status bar, so with viewport-fit=cover
            the header drew underneath it - the clock and the battery sat on top
            of the title. In Safari the address bar occupies that space, which is
            why this only ever broke once the app was installed. min-h lets the
            bar grow by the inset instead of clipping its contents. */}
        <header className="safe-area-top sticky top-0 z-20 flex min-h-14 items-center gap-4 border-b bg-card/80 px-4 backdrop-blur-sm lg:px-6">
          <SidebarToggle onClick={() => setSidebarOpen(true)} />
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary lg:hidden">
              <span className="text-xs font-bold text-primary-foreground">F</span>
            </div>
          </div>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
