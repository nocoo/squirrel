import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { BasaltProviders } from "@/components/BasaltProviders";
import { DashboardLayout } from "@/components/DashboardLayout";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const SecretsPage = lazy(() => import("@/pages/SecretsPage"));
const ClientsPage = lazy(() => import("@/pages/ClientsPage"));
const AuditLogsPage = lazy(() => import("@/pages/AuditLogsPage"));
const AuthorizePage = lazy(() => import("@/pages/AuthorizePage"));

function AdminShellRoutes() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/secrets" element={<SecretsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/logs" element={<AuditLogsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <BasaltProviders>
        <Routes>
          <Route path="/authorize" element={<AuthorizePage />} />
          <Route path="/admin/*" element={<AdminShellRoutes />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </BasaltProviders>
    </BrowserRouter>
  );
}
