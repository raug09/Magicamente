import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Anchor, Loader, Paper, Text } from '@mantine/core';
import { request } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';

type VerifyState = { status: 'loading' } | { status: 'ok'; message: string } | { status: 'error'; error: unknown };

/** Destino del enlace del correo de confirmación: /verify-email?token=... (la ruta que envía el backend). */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<VerifyState>(() =>
    token ? { status: 'loading' } : { status: 'error', error: new Error('El enlace no tiene el token de confirmación.') }
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    request<{ message: string }>('/api/auth/verify-email', { method: 'POST', body: { token }, anonymous: true })
      .then((response) => active && setState({ status: 'ok', message: response.message }))
      .catch((error: unknown) => active && setState({ status: 'error', error }));
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Paper withBorder p="xl" radius="md" maw={480} mx="auto">
      {state.status === 'loading' && (
        <>
          <Loader />
          <Text mt="sm">Confirmando tu email…</Text>
        </>
      )}
      {state.status === 'ok' && (
        <Alert color="teal" title="Email confirmado">
          {state.message}{' '}
          <Anchor component={Link} to="/entrar">
            Entra a tu cuenta
          </Anchor>
          .
        </Alert>
      )}
      {state.status === 'error' && <ErrorAlert error={state.error} />}
    </Paper>
  );
}
