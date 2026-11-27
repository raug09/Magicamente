import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Group, Loader, PasswordInput, Stack, Text, TextInput, Title, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { request } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatDay, formatTime } from '../../lib/format';

interface SessionInfo {
  _id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeZone = user?.timezone ?? 'UTC';

  return (
    <Stack gap="xl">
      <Title order={2}>Mi cuenta</Title>
      <ChangeEmailSection currentEmail={user?.email ?? ''} />
      <SessionsSection
        timeZone={timeZone}
        onSignedOut={() => {
          logout();
          navigate('/entrar', { replace: true });
        }}
        queryClient={queryClient}
      />
    </Stack>
  );
}

function ChangeEmailSection({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => request<{ message: string }>('/api/auth/change-email', { method: 'POST', body: { email, password } }),
    onSuccess: (response) => {
      setSent(response.message);
      setPassword('');
    },
  });

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack>
        <div>
          <Title order={3}>Cambiar email</Title>
          <Text size="sm" c="dimmed">
            Email actual: {currentEmail}. Te enviaremos un enlace a la nueva dirección; el cambio se hace al confirmarlo.
          </Text>
        </div>
        {sent && (
          <Alert color="teal" title="Revisa la nueva dirección">
            {sent}
          </Alert>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSent(null);
            change.mutate();
          }}
        >
          <Stack>
            <ErrorAlert error={change.error} />
            <TextInput
              label="Nuevo email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Contraseña actual"
              description="Por seguridad, pedimos tu contraseña para cambiar el email"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Group>
              <Button type="submit" loading={change.isPending}>
                Enviar enlace de confirmación
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Card>
  );
}

function SessionsSection({
  timeZone,
  onSignedOut,
  queryClient,
}: {
  timeZone: string;
  onSignedOut: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => request<SessionInfo[]>('/api/auth/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (session: SessionInfo) => request(`/api/auth/sessions/${session._id}`, { method: 'DELETE' }),
    onSuccess: (_data, session) => {
      if (session.current) return onSignedOut();
      notifications.show({ color: 'teal', message: 'Sesión cerrada.' });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const signOutEverywhere = useMutation({
    mutationFn: () => request('/api/auth/logout-all', { method: 'POST' }),
    onSuccess: onSignedOut,
  });

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>Sesiones abiertas</Title>
            <Text size="sm" c="dimmed">
              Dispositivos y navegadores con la cuenta iniciada. Si ves una que no reconoces, ciérrala y cambia tu contraseña.
            </Text>
          </div>
          <Button color="red" variant="outline" loading={signOutEverywhere.isPending} onClick={() => signOutEverywhere.mutate()}>
            Cerrar todas
          </Button>
        </Group>
        <ErrorAlert error={sessions.error ?? revoke.error ?? signOutEverywhere.error} />
        {sessions.isPending && <Loader />}
        {sessions.data?.map((session) => (
          <Group key={session._id} justify="space-between" wrap="nowrap">
            <Stack gap={2}>
              <Text size="sm" fw={600}>
                Iniciada el {formatDay(session.createdAt, timeZone).toLowerCase()} a las {formatTime(session.createdAt, timeZone)}
              </Text>
              <Text size="xs" c="dimmed">
                Caduca el {formatDay(session.expiresAt, timeZone).toLowerCase()} a las {formatTime(session.expiresAt, timeZone)}
              </Text>
            </Stack>
            {session.current ? (
              <Badge variant="light">Esta sesión</Badge>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                loading={revoke.isPending && revoke.variables?._id === session._id}
                onClick={() => revoke.mutate(session)}
              >
                Cerrar
              </Button>
            )}
          </Group>
        ))}
      </Stack>
    </Card>
  );
}
