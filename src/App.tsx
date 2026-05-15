import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/store/auth";
import { GrowsProvider } from "@/store/grows";
import AppShell from "@/components/AppShell";
import Auth from "./pages/Auth";
import Timeline from "./pages/Timeline";
import Grows from "./pages/Grows";
import Coach from "./pages/Coach";
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
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<AppShell />}>
                <Route path="/" element={<Timeline />} />
                <Route path="/grows" element={<Grows />} />
                <Route path="/coach" element={<Coach />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </GrowsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
