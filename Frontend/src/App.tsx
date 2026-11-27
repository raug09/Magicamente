import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { PsychologistsPage } from './features/psychologists/PsychologistsPage';
import { PsychologistPage } from './features/psychologists/PsychologistPage';
import { MyAppointmentsPage } from './features/appointments/MyAppointmentsPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/psicologos" replace />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/verificar-email" element={<VerifyEmailPage />} />
        <Route
          path="/psicologos"
          element={
            <RequireAuth>
              <PsychologistsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/psicologos/:id"
          element={
            <RequireAuth>
              <PsychologistPage />
            </RequireAuth>
          }
        />
        <Route
          path="/citas"
          element={
            <RequireAuth>
              <MyAppointmentsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/psicologos" replace />} />
      </Routes>
    </Layout>
  );
}
