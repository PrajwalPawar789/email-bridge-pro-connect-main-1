
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Campaigns from "./pages/Campaigns";
import CampaignTracker from "./pages/CampaignTracker";
import Inbox from "./pages/Inbox";
import Automations from "./pages/Automations";
import Pipeline from "./pages/Pipeline";
import Subscription from "./pages/Subscription";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./providers/AuthProvider";
import Onboarding from "./pages/Onboarding";
import OnboardingGuard from "./components/onboarding/OnboardingGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<OnboardingGuard />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/automations" element={<Automations />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/billing" element={<Subscription />} />
              <Route path="/spending" element={<Subscription />} />
              <Route path="/campaign/:id" element={<CampaignTracker />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
