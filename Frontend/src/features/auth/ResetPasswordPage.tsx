import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Anchor, Button, Paper, PasswordInput, Stack, Title } from '@mantine/core';
import { request } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';

/** Destino del enlace del correo de recuperación: /reset-password?token=... */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(new Error('Las contraseñas no coinciden.'));
      return;
    }
    setSubmitting(true);
    try {
      const response = await request<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        anonymous: true,
      });
      setDone(response.message);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
        <ErrorAlert error={new Error('El enlace no es válido. Pide uno nuevo desde "Recuperar contraseña".')} />
      </Paper>
    );
  }

  if (done) {
    return (
      <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
        <Alert color="teal" title="Contraseña cambiada">
          {done}{' '}
          <Anchor component={Link} to="/entrar">
            Entra con tu nueva contraseña
          </Anchor>
          .
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
      <Title order={2} mb="md">
        Elige una contraseña nueva
      </Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          <ErrorAlert error={error} />
          <PasswordInput
            label="Contraseña nueva"
            description="Entre 8 y 72 caracteres"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <PasswordInput
            label="Repite la contraseña"
            autoComplete="new-password"
            required
            value={confirm}
            error={mismatch ? 'No coincide con la contraseña' : undefined}
            onChange={(e) => setConfirm(e.currentTarget.value)}
          />
          <Button type="submit" loading={submitting} disabled={mismatch}>
            Cambiar contraseña
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
