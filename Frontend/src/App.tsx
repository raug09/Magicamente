import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './auth/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { VerifyEmailPage } from './features/auth/VerifyEmailPage';
import { PsychologistsPage } from './features/psychologists/PsychologistsPage';
import { PsychologistPage } from './features/psychologists/PsychologistPage';
import { MyAppointmentsPage } from './features/appointments/MyAppointmentsPage';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { ConfirmEmailChangePage } from './features/auth/ConfirmEmailChangePage';
import { AccountPage } from './features/account/AccountPage';

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/psicologos" replace />} />
        <Route path="/entrar" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        {/* Rutas que usan los enlaces de los correos del backend (ver Backend/src/services/authService.ts). */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/recuperar" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
        <Route
          path="/cuenta"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
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
