import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import RegisterLibrary from "./pages/RegisterLibrary.jsx";
import RegistrationSuccess from "./pages/RegistrationSuccess.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute.jsx";

import FeaturesPage from "./pages/FeaturesPage.jsx";
import PricingPage from "./pages/PricingPage.jsx";
import DemoPage from "./pages/DemoPage.jsx";
import HelpCenterPage from "./pages/HelpCenterPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import DocsPage from "./pages/DocsPage.jsx";
import LegalPage from "./pages/LegalPage.jsx";
import FounderPage from "./pages/FounderPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/features" element={<FeaturesPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/help" element={<HelpCenterPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route
        path="/privacy-policy"
        element={<LegalPage slug="privacy-policy" />}
      />
      <Route
        path="/terms-of-service"
        element={<LegalPage slug="terms-of-service" />}
      />
      <Route
        path="/refund-policy"
        element={<LegalPage slug="refund-policy" />}
      />
      <Route path="/founder" element={<FounderPage />} />

      <Route path="/register" element={<RegisterLibrary />} />
      <Route path="/register/success" element={<RegistrationSuccess />} />
      <Route path="/LMS-admin/login" element={<AdminLogin />} />
      <Route
        path="/LMS-admin"
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        }
      />
    </Routes>
  );
}
