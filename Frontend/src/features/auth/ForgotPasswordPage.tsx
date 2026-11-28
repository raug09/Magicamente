import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Anchor, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { request } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';

/** Pide el enlace para restablecer la contraseña. El servidor responde igual exista o no la cuenta. */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await request<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: { email },
        anonymous: true,
      });
      setMessage(response.message);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper withBorder p="xl" radius="md" maw={420} mx="auto">
      <Title order={2} mb="md">
        Recuperar contraseña
      </Title>
      {message ? (
        <Alert color="teal" title="Revisa tu correo">
          {message}
        </Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          <Stack>
            <Text size="sm" c="dimmed">
              Te enviaremos un enlace para elegir una contraseña nueva. Caduca en 1 hora.
            </Text>
            <ErrorAlert error={error} />
            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <Button type="submit" loading={submitting}>
              Enviar enlace
            </Button>
          </Stack>
        </form>
      )}
      <Text size="sm" mt="md">
        <Anchor component={Link} to="/entrar">
          Volver a entrar
        </Anchor>
      </Text>
    </Paper>
  );
}
