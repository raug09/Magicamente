import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Anchor, Loader, Paper, Text } from '@mantine/core';
import { request } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';

type ConfirmState = { status: 'loading' } | { status: 'ok'; message: string } | { status: 'error'; error: unknown };

/** Destino del enlace enviado a la nueva dirección: /confirm-email-change?token=... */
export function ConfirmEmailChangePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<ConfirmState>(() =>
    token ? { status: 'loading' } : { status: 'error', error: new Error('El enlace no tiene el token de confirmación.') }
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    request<{ message: string }>('/api/auth/confirm-email-change', { method: 'POST', body: { token }, anonymous: true })
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
          <Text mt="sm">Confirmando el nuevo email…</Text>
        </>
      )}
      {state.status === 'ok' && (
        <Alert color="teal" title="Email actualizado">
          {state.message}{' '}
          <Anchor component={Link} to="/entrar">
            Entra con tu nuevo email
          </Anchor>
          .
        </Alert>
      )}
      {state.status === 'error' && <ErrorAlert error={state.error} />}
    </Paper>
  );
}
