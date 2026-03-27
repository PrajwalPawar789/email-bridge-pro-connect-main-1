
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootPage from "./pages/RootPage";
import Auth from "./pages/Auth";
import AuthConfirm from "./pages/AuthConfirm";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Campaigns from "./pages/Campaigns";
import CampaignTracker from "./pages/CampaignTracker";
import Inbox from "./pages/Inbox";
import Automations from "./pages/Automations";
import Pipeline from "./pages/Pipeline";
import Find from "./pages/Find";
import EmailBuilder from "./pages/EmailBuilder";
import LandingPages from "./pages/LandingPages";
import SiteConnector from "./pages/SiteConnector";
import PublishedLandingPage from "./pages/PublishedLandingPage";
import Subscription from "./pages/Subscription";
import Billing from "./pages/Billing";
import Spending from "./pages/Spending";
import Referrals from "./pages/Referrals";
import Team from "./pages/Team";
import Support from "./pages/Support";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./providers/AuthProvider";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";
import Onboarding from "./pages/Onboarding";
import OnboardingGuard from "./components/onboarding/OnboardingGuard";
import WorkspaceBillingGuard from "./components/auth/WorkspaceBillingGuard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<RootPage />} />
              <Route path="/pages/:slug" element={<PublishedLandingPage />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/confirm" element={<AuthConfirm />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<OnboardingGuard />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/automations" element={<Automations />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/find" element={<Find />} />
                <Route path="/email-builder" element={<EmailBuilder />} />
                <Route path="/landing-pages" element={<LandingPages />} />
                <Route path="/site-connector" element={<SiteConnector />} />
                <Route path="/team" element={<Team />} />
                <Route path="/support" element={<Support />} />
                <Route path="/referrals" element={<Referrals />} />
                <Route path="/campaign/:id" element={<CampaignTracker />} />
                <Route element={<WorkspaceBillingGuard />}>
                  <Route path="/subscription" element={<Subscription />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/spending" element={<Spending />} />
                </Route>
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
