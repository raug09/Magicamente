import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Group, Loader, Pagination, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { request } from '../../api/client';
import type { MyAppointment, Page } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert } from '../../components/ErrorAlert';
import { formatDay, formatTime, hasStarted } from '../../lib/format';

const PAGE_SIZE = 10;

const STATE_LABEL: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: 'blue' },
  completada: { label: 'Completada', color: 'teal' },
  cancelada: { label: 'Cancelada', color: 'gray' },
};

/** Nombre de la otra persona: el psicólogo para el paciente (el backend lo envía como objeto). */
const otherPartyName = (appointment: MyAppointment): string => {
  const psychologist = appointment.psychologistId;
  return typeof psychologist === 'object' && psychologist !== null ? psychologist.name : '—';
};

export function MyAppointmentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const timeZone = user?.timezone ?? 'UTC';
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['appointments', page],
    queryFn: () => request<Page<MyAppointment>>('/api/appointments/appointment', { query: { page, limit: PAGE_SIZE } }),
    placeholderData: (previous) => previous,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => request(`/api/appointments/appointment/cancel/${id}`, { method: 'PATCH' }),
    onSuccess: () => {
      notifications.show({ color: 'teal', message: 'Cita cancelada. La hora queda libre.' });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'No se pudo cancelar.' });
    },
  });

  return (
    <Stack>
      <Title order={2}>Mis citas</Title>
      <ErrorAlert error={query.error} />
      {query.isPending && <Loader />}
      {query.data && query.data.items.length === 0 && (
        <Text c="dimmed">Aún no tienes citas. Busca un psicólogo para reservar la primera.</Text>
      )}

      {query.data?.items.map((appointment) => {
        const state = STATE_LABEL[appointment.state] ?? { label: appointment.state, color: 'gray' };
        const canCancel = appointment.state === 'pendiente' && !hasStarted(appointment.time);
        return (
          <Card key={appointment._id} withBorder radius="md" padding="lg">
            <Group justify="space-between" align="center">
              <Stack gap={4}>
                <Text fw={600}>{otherPartyName(appointment)}</Text>
                <Text size="sm">
                  {formatDay(appointment.time, timeZone)} · {formatTime(appointment.time, timeZone)}
                </Text>
                <Badge color={state.color} variant="light">
                  {state.label}
                </Badge>
              </Stack>
              {canCancel && (
                <Button
                  variant="outline"
                  color="red"
                  loading={cancel.isPending && cancel.variables === appointment._id}
                  onClick={() => cancel.mutate(appointment._id)}
                >
                  Cancelar
                </Button>
              )}
            </Group>
          </Card>
        );
      })}

      {query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} mt="md" />}
    </Stack>
  );
}
