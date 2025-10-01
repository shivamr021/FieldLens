// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AppSidebar } from "./components/AppSidebar";
import Dashboard from "./pages/Dashboard";
import CreateTask from "./components/CreateTask";
import TaskHistory from "./pages/TaskHistory";
import Exports from "./pages/Exports";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/toggle";
import ProtectedRoute from "./auth/ProtectedRoute";
import { AuthProvider } from "./auth/AuthProvider";
import { CreateTaskDialogProvider } from "@/providers/create-task-dialog-provider";
import Login from "./pages/Login";

const queryClient = new QueryClient();

function ProtectedLayout() {
  return (
    <div className="flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center px-6">
          <SidebarTrigger className="-ml-1" />
          <div className="flex items-center w-full justify-between gap-2 ml-4">
            <div className="flex gap-2">
              <div className="w-6 h-6 bg-gradient-primary rounded-md" />
              <span className="font-semibold text-foreground">Automation Hub</span>
            </div>
            <ModeToggle />
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <CreateTaskDialogProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <SidebarProvider>
                  <Routes>
                    {/* Public */}
                    <Route path="/login" element={<Login />} />

                    {/* Private */}
                    <Route element={<ProtectedRoute />}>
                      <Route element={<ProtectedLayout />}>
                        {/* index === "/"  -> if not logged, ProtectedRoute redirects to /login */}
                        <Route index element={<Dashboard />} />
                        <Route path="/history" element={<TaskHistory />} />
                        <Route path="/exports" element={<Exports />} />
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Route>
                  </Routes>
                </SidebarProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </CreateTaskDialogProvider>
    </ThemeProvider>
  );
}
