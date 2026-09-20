import { BrowserRouter, Routes, Route } from "react-router";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Dashboard } from "@/pages/Dashboard";
import { DomainDetails } from "@/pages/DomainDetails";
import { MonitoringSettings } from "@/pages/MonitoringSettings";
import { ApiKeys } from "@/pages/ApiKeys";
import { Webhooks } from "@/pages/Webhooks";
import { Account } from "@/pages/Account";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/domains/:id" element={<DomainDetails />} />
          <Route path="/domains/:id/monitoring" element={<MonitoringSettings />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/webhooks" element={<Webhooks />} />
          <Route path="/account" element={<Account />} />
        </Route>

        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}
