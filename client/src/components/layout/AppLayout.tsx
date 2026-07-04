import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar, SidebarToggle } from './Sidebar';
import { NotificationBell } from './NotificationBell';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen w-full flex-col lg:ml-64 pb-16 lg:pb-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-card/80 backdrop-blur-sm px-4 lg:px-6">
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
