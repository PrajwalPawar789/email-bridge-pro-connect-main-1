
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootPage from "./pages/RootPage";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Campaigns from "./pages/Campaigns";
import CampaignTracker from "./pages/CampaignTracker";
import Inbox from "./pages/Inbox";
import Automations from "./pages/Automations";
import Pipeline from "./pages/Pipeline";
import EmailBuilder from "./pages/EmailBuilder";
import LandingPages from "./pages/LandingPages";
import SiteConnector from "./pages/SiteConnector";
import PublishedLandingPage from "./pages/PublishedLandingPage";
import Subscription from "./pages/Subscription";
import Billing from "./pages/Billing";
import Spending from "./pages/Spending";
import Referrals from "./pages/Referrals";
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
            <Route path="/" element={<RootPage />} />
            <Route path="/pages/:slug" element={<PublishedLandingPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<OnboardingGuard />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/automations" element={<Automations />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/email-builder" element={<EmailBuilder />} />
              <Route path="/landing-pages" element={<LandingPages />} />
              <Route path="/site-connector" element={<SiteConnector />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/spending" element={<Spending />} />
              <Route path="/referrals" element={<Referrals />} />
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
