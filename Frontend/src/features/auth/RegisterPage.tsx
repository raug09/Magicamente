import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Button, Paper, PasswordInput, Select, Stack, Text, TextInput, Title, Alert } from '@mantine/core';
import { request } from '../../api/client';
import { ErrorAlert } from '../../components/ErrorAlert';
import { browserTimeZone } from '../../lib/format';

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'paciente' });
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await request<{ message: string }>('/api/auth/register', {
        method: 'POST',
        anonymous: true,
        body: { ...form, role: form.role, timezone: browserTimeZone() },
      });
      setDone(response.message);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Paper withBorder p="xl" radius="md" maw={480} mx="auto">
        <Alert color="teal" title="Revisa tu correo">
          {done} Después podrás{' '}
          <Anchor component={Link} to="/entrar">
            entrar
          </Anchor>
          .
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper withBorder p="xl" radius="md" maw={480} mx="auto">
      <Title order={2} mb="md">
        Crear cuenta
      </Title>
      <form onSubmit={handleSubmit}>
        <Stack>
          <ErrorAlert error={error} />
          <TextInput label="Nombre" required maxLength={100} value={form.name} onChange={(e) => update('name')(e.currentTarget.value)} />
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update('email')(e.currentTarget.value)}
          />
          <PasswordInput
            label="Contraseña"
            description="Entre 8 y 72 caracteres"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => update('password')(e.currentTarget.value)}
          />
          <Select
            label="Soy"
            allowDeselect={false}
            data={[
              { value: 'paciente', label: 'Paciente, busco un psicólogo' },
              { value: 'psicologo', label: 'Psicólogo/a' },
            ]}
            value={form.role}
            onChange={(value) => value && update('role')(value)}
          />
          {form.role === 'psicologo' && (
            <Text size="sm" c="dimmed">
              Tu cuenta quedará pendiente hasta que el equipo verifique tu documentación.
            </Text>
          )}
          <Button type="submit" loading={submitting}>
            Crear cuenta
          </Button>
        </Stack>
      </form>
      <Text size="sm" mt="md">
        ¿Ya tienes cuenta?{' '}
        <Anchor component={Link} to="/entrar">
          Entra aquí
        </Anchor>
      </Text>
    </Paper>
  );
}
