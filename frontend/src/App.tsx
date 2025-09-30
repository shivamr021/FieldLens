import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppSidebar } from "./components/AppSidebar";
import Dashboard from "./pages/Dashboard";
import CreateTask from "./pages/CreateTask";
import TaskHistory from "./pages/TaskHistory";
import Exports from "./pages/Exports";
import NotFound from "./pages/NotFound";
import { ThemeProvider } from "./components/theme-provider";
import { ModeToggle } from "./components/toggle";
import { CreateTaskDialogProvider } from "@/providers/create-task-dialog-provider";
const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider defaultTheme="system" storageKey="ui-theme">
    <CreateTaskDialogProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <SidebarProvider>
              <div className="min-h-screen flex w-full bg-background">
                <AppSidebar />

                <div className="flex-1 flex flex-col">
                  <header className="h-14 border-b bg-card/50 backdrop-blur-sm flex items-center px-6">
                    <SidebarTrigger className="-ml-1" />
                    <div className="flex items-center w-full justify-between gap-2 ml-4">
                      <div className="flex gap-2">
                        <div className="w-6 h-6 bg-gradient-primary rounded-md"></div>
                        <span className="font-semibold text-foreground">Automation Hub</span>
                      </div>
                      <div>
                        <ModeToggle />
                      </div>
                    </div>
                  </header>

                  <main className="flex-1 p-6">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/history" element={<TaskHistory />} />
                      <Route path="/exports" element={<Exports />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>
                </div>
              </div>
            </SidebarProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </CreateTaskDialogProvider>
  </ThemeProvider>

);

export default App;
