import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { VerdantProvider } from "@/store/verdant";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";

import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "./pages/app/Dashboard";
import Plants from "./pages/app/Plants";
import PlantDetail from "./pages/app/PlantDetail";
import Diary from "./pages/app/Diary";
import DiaryEntryDetail from "./pages/app/DiaryEntryDetail";
import CalendarPage from "./pages/app/CalendarPage";
import Photos from "./pages/app/Photos";
import AskMyGrow from "./pages/app/AskMyGrow";
import Reports from "./pages/app/Reports";
import Sensors from "./pages/app/Sensors";
import CustomerHub from "./pages/app/CustomerHub";
import Diagnosis from "./pages/app/Diagnosis";
import SMSOptIns from "./pages/app/SMSOptIns";
import Settings from "./pages/app/Settings";
import QAChecklist from "./pages/app/QAChecklist";

import CustomerLayout from "./pages/customer/CustomerLayout";
import CustomerHome from "./pages/customer/CustomerHome";
import CustomerGuide from "./pages/customer/CustomerGuide";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <VerdantProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="plants" element={<Plants />} />
              <Route path="plants/:id" element={<PlantDetail />} />
              <Route path="diary" element={<Diary />} />
              <Route path="diary/:id" element={<DiaryEntryDetail />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="photos" element={<Photos />} />
              <Route path="ask" element={<AskMyGrow />} />
              <Route path="diagnosis" element={<Diagnosis />} />
              <Route path="reports" element={<Reports />} />
              <Route path="sensors" element={<Sensors />} />
              <Route path="customer" element={<CustomerHub />} />
              <Route path="customer/sms" element={<SMSOptIns />} />
              <Route path="settings" element={<Settings />} />
              <Route path="qa" element={<QAChecklist />} />
            </Route>
            <Route path="/grow" element={<CustomerLayout />}>
              <Route index element={<CustomerHome />} />
              <Route path=":slug" element={<CustomerGuide />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </VerdantProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
