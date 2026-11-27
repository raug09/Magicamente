import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Anchor, Button, Paper, PasswordInput, Stack, TextInput, Title, Text } from '@mantine/core';
import { request } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert } from '../../components/ErrorAlert';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/psicologos';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token } = await request<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        anonymous: true,
      });
      await login(token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
      <Title order={2} mb="md">
        Entrar
      </Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          <ErrorAlert error={error} />
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <PasswordInput
            label="Contraseña"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
          <Button type="submit" loading={submitting}>
            Entrar
          </Button>
          <Anchor component={Link} to="/recuperar" size="sm">
            ¿Olvidaste tu contraseña?
          </Anchor>
        </Stack>
      </form>
      <Text size="sm" mt="md">
        ¿No tienes cuenta?{' '}
        <Anchor component={Link} to="/registro">
          Regístrate
        </Anchor>
      </Text>
    </Paper>
  );
}
