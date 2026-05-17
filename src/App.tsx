import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import { NugsProvider } from "@/store/nugs";
import AppShell from "@/components/AppShell";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Tents from "./pages/Tents";
import TentDetail from "./pages/TentDetail";
import Plants from "./pages/Plants";
import PlantDetail from "./pages/PlantDetail";
import Sensors from "./pages/Sensors";
import Tasks from "./pages/Tasks";
import Cameras from "./pages/Cameras";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Timeline from "./pages/Timeline";
import Grows from "./pages/Grows";
import Coach from "./pages/Coach";
import Rewards from "./pages/Rewards";
import Diagnostics from "./pages/Diagnostics";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GrowsProvider>
            <NugsProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tents" element={<Tents />} />
                  <Route path="/tents/:id" element={<TentDetail />} />
                  <Route path="/plants" element={<Plants />} />
                  <Route path="/plants/:id" element={<PlantDetail />} />
                  <Route path="/sensors" element={<Sensors />} />
                  <Route path="/logs" element={<Timeline />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/cameras" element={<Cameras />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/doctor" element={<Coach />} />
                  <Route path="/grows" element={<Grows />} />
                  <Route path="/rewards" element={<Rewards />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </NugsProvider>
          </GrowsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
