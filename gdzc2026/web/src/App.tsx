import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { getToken } from "./api";
import { RequireRole } from "./components/RequireRole";
import { ROLES_ADMIN_ONLY, ROLES_STAFF } from "./config/menu";
import { useAuth } from "./context/AuthContext";
import { AdminLayout } from "./layout/AdminLayout";
import { AssetDetailPage } from "./pages/asset/AssetDetailPage";
import { AssetEditPage } from "./pages/asset/AssetEditPage";
import { AssetsPage } from "./pages/AssetsPage";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NetworkPage } from "./pages/NetworkPage";
import { NewAssetPage } from "./pages/NewAssetPage";
import { OrgPage } from "./pages/OrgPage";
import {
  PageAssetCategories,
  PageAssetLocations,
  PageNamingPolicies,
} from "./pages/extended/MasterDataPages";
import { PageAssetDisposals, PageAssetTransfers, PageInventoryExecute, PageInventoryTasks } from "./pages/extended/OpsPages";
import {
  PageFinanceCards,
  PageFinanceDepreciation,
  PageProcurementOrders,
  PageProcurementPending,
} from "./pages/extended/FinanceProcurementPages";
import { PageSoftwareLicenses } from "./pages/extended/SoftwareLicensesPage";
import { ServerDetailPage } from "./pages/servers/ServerDetailPage";
import { ServerListPage } from "./pages/servers/ServerListPage";
import { ServerNewPage } from "./pages/servers/ServerNewPage";
import {
  PageMfgEquipment,
  PageMfgMolds,
  PageNetworkIpRecords,
  PageOrgSync,
  PageReportsExport,
  PageReportsSummary,
  PageSystemErp,
  PageAssetFieldDefinitions,
  PageSystemSettings,
  PageSystemUsers,
} from "./pages/extended/SystemPages";

function ProtectedRoute() {
  const { token, ready } = useAuth();
  const loc = useLocation();
  const hasSession = Boolean(token ?? getToken());
  if (!ready) {
    return (
      <div className="page-loading">
        <div className="loading-inner">正在加载…</div>
      </div>
    );
  }
  if (!hasSession) {
    return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  }
  return <Outlet />;
}

function RootRedirect() {
  const { token, ready } = useAuth();
  const hasSession = Boolean(token ?? getToken());
  if (!ready) {
    return (
      <div className="page-loading">
        <div className="loading-inner">正在加载…</div>
      </div>
    );
  }
  return <Navigate to={hasSession ? "/app/dashboard" : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RootRedirect />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />

          <Route path="dashboard" element={<DashboardPage />} />

          <Route
            path="assets/new"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <NewAssetPage />
              </RequireRole>
            }
          />
          <Route path="assets/categories" element={<PageAssetCategories />} />
          <Route path="assets/locations" element={<PageAssetLocations />} />
          <Route
            path="assets/transfers"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageAssetTransfers />
              </RequireRole>
            }
          />
          <Route
            path="assets/disposals"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageAssetDisposals />
              </RequireRole>
            }
          />
          <Route
            path="assets/:id/edit"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <AssetEditPage />
              </RequireRole>
            }
          />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="assets" element={<AssetsPage />} />

          <Route
            path="procurement/pending"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageProcurementPending />
              </RequireRole>
            }
          />
          <Route
            path="procurement/orders"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageProcurementOrders />
              </RequireRole>
            }
          />

          <Route path="inventory/tasks" element={<PageInventoryTasks />} />
          <Route
            path="inventory/execute"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageInventoryExecute />
              </RequireRole>
            }
          />

          <Route path="finance/depreciation" element={<PageFinanceDepreciation />} />
          <Route path="finance/cards" element={<PageFinanceCards />} />

          <Route path="mfg/equipment" element={<PageMfgEquipment />} />
          <Route path="mfg/molds" element={<PageMfgMolds />} />

          <Route path="org/sync" element={<PageOrgSync />} />
          <Route path="org" element={<OrgPage />} />

          <Route
            path="servers/new"
            element={
              <RequireRole roles={ROLES_ADMIN_ONLY}>
                <ServerNewPage />
              </RequireRole>
            }
          />
          <Route path="servers/:id" element={<ServerDetailPage />} />
          <Route path="servers" element={<ServerListPage />} />

          <Route path="network/ip-records" element={<PageNetworkIpRecords />} />
          <Route path="network" element={<NetworkPage />} />

          <Route path="naming/policies" element={<PageNamingPolicies />} />
          <Route path="software/licenses" element={<PageSoftwareLicenses />} />

          <Route path="reports/summary" element={<PageReportsSummary />} />
          <Route
            path="reports/export"
            element={
              <RequireRole roles={ROLES_STAFF}>
                <PageReportsExport />
              </RequireRole>
            }
          />

          <Route
            path="system/users"
            element={
              <RequireRole roles={ROLES_ADMIN_ONLY}>
                <PageSystemUsers />
              </RequireRole>
            }
          />
          <Route
            path="system/settings"
            element={
              <RequireRole roles={ROLES_ADMIN_ONLY}>
                <PageSystemSettings />
              </RequireRole>
            }
          />
          <Route
            path="system/asset-fields"
            element={
              <RequireRole roles={ROLES_ADMIN_ONLY}>
                <PageAssetFieldDefinitions />
              </RequireRole>
            }
          />
          <Route path="system/erp" element={<PageSystemErp />} />

          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
