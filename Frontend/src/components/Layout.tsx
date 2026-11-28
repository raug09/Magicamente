import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Anchor, Box, Button, Container, Group, Text } from '@mantine/core';
import { useAuth } from '../auth/AuthProvider';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/entrar');
  };

  return (
    <Box mih="100vh">
      <Box component="header" py="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Container size="lg">
          <Group justify="space-between">
            <Anchor component={Link} to="/" fw={700} c="dark" underline="never">
              Magicamente
            </Anchor>
            <Group gap="md">
              {user ? (
                <>
                  <Anchor component={Link} to="/psicologos">
                    Psicólogos
                  </Anchor>
                  <Anchor component={Link} to="/citas">
                    Mis citas
                  </Anchor>
                  <Anchor component={Link} to="/cuenta">
                    Mi cuenta
                  </Anchor>
                  <Text size="sm" c="dimmed" visibleFrom="sm">
                    {user.name}
                  </Text>
                  <Button variant="subtle" size="xs" onClick={handleLogout}>
                    Salir
                  </Button>
                </>
              ) : (
                <>
                  <Anchor component={Link} to="/entrar">
                    Entrar
                  </Anchor>
                  <Anchor component={Link} to="/registro">
                    Crear cuenta
                  </Anchor>
                </>
              )}
            </Group>
          </Group>
        </Container>
      </Box>
      <Container size="lg" py="xl">
        {children}
      </Container>
    </Box>
  );
}
