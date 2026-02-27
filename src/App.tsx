import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import ApplicationForm from "./pages/ApplicationForm";
import TexturePackPage from "./pages/TexturePackPage";
import AdminPanel from "./pages/AdminPanel";
import InstallationPage from "./pages/InstallationPage";
import VerifyPage from "./pages/VerifyPage";
import ClanListPage from "./pages/ClanListPage";
import BanReportPage from "./pages/BanReportPage";
import NotFound from "./pages/NotFound";
import ClanListErrorBoundary from "./components/ClanListErrorBoundary";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/apply" element={<ApplicationForm />} />
            <Route path="/pack" element={<TexturePackPage />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route
              path="/clan-list"
              element={
                <ClanListErrorBoundary>
                  <ClanListPage />
                </ClanListErrorBoundary>
              }
            />
            <Route path="/installation" element={<InstallationPage />} />
            <Route path="/ban-report" element={<BanReportPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
