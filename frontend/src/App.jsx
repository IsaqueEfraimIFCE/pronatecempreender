import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { CpfValidator } from './features/cpf-validation/CpfValidator';
import { Dashboard } from './features/dashboard-setec/Dashboard';
import { SecondaryDashboard } from './features/dashboard-coordenacao/SecondaryDashboard';
import { HomePage } from './features/home/HomePage';
import { ReportForm } from './features/reports/ReportForm';
import { ParticipantForm } from './features/participants/ParticipantForm';
import { AdminPage } from './features/admin/AdminPage';

const VIEW_PATHS = {
  home: '/',
  validate: '/consulta',
  dashboard: '/setec',
  secondaryDashboard: '/coordenacao',
  reports: '/relatorios',
  participants: '/participantes',
};

function App() {
  const navigate = useNavigate();

  function handleNavigate(view) {
    navigate(VIEW_PATHS[view] || '/');
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage onNavigate={handleNavigate} />} />
        <Route path="/consulta" element={<CpfValidator />} />
        <Route path="/setec" element={<Dashboard />} />
        <Route path="/coordenacao" element={<SecondaryDashboard />} />
        <Route path="/relatorios" element={<ReportForm />} />
        <Route path="/participantes" element={<ParticipantForm />} />
        <Route path="/administracao" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
