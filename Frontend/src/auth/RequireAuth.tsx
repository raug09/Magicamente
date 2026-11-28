import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuth } from './AuthProvider';

/** Solo deja pasar a usuarios con sesión; el resto va al login y vuelve aquí después. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Center mih="50vh">
        <Loader />
      </Center>
    );
  }
  if (!user) {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }
  return children;
}
