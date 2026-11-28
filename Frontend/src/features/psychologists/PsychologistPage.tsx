import { useParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { request } from '../../api/client';
import type { Page, PublicPsychologist, Schedule } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorAlert } from '../../components/ErrorAlert';
import { dayKey, formatDay, formatTime } from '../../lib/format';

const SLOTS_PAGE_SIZE = 50;

export function PsychologistPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const timeZone = user?.timezone ?? 'UTC';

  const profile = useQuery({
    queryKey: ['psychologist', id],
    queryFn: () => request<PublicPsychologist>(`/api/users/${id}`),
    enabled: Boolean(id),
  });

  const slots = useQuery({
    queryKey: ['slots', id],
    queryFn: () => request<Page<Schedule>>(`/api/schedule/${id}`, { query: { available: 'true', page: 1, limit: SLOTS_PAGE_SIZE } }),
    enabled: Boolean(id),
  });

  // Agrupa las franjas por día, en la zona del usuario que mira la pantalla.
  const days = useMemo(() => {
    const groups = new Map<string, Schedule[]>();
    for (const slot of slots.data?.items ?? []) {
      const key = dayKey(slot.startsAt, timeZone);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [slots.data, timeZone]);

  const book = useMutation({
    mutationFn: (scheduleId: string) => request('/api/appointments/appointment', { method: 'POST', body: { scheduleId } }),
    onSuccess: () => {
      notifications.show({ color: 'teal', message: 'Cita reservada. Te llegará un recordatorio antes de la hora.' });
      queryClient.invalidateQueries({ queryKey: ['slots', id] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'No se pudo reservar.' });
      // Otra persona pudo quedarse con la franja mientras la mirabas.
      queryClient.invalidateQueries({ queryKey: ['slots', id] });
    },
  });

  if (profile.isPending) return <Loader />;
  if (profile.error) return <ErrorAlert error={profile.error} />;
  const psychologist = profile.data;

  return (
    <Stack>
      <div>
        <Title order={2}>{psychologist.name}</Title>
        {psychologist.studies && psychologist.studies.length > 0 && (
          <Group gap={6} mt={6}>
            {psychologist.studies.map((study) => (
              <Badge key={study} variant="light">
                {study}
              </Badge>
            ))}
          </Group>
        )}
        {psychologist.description && <Text mt="sm">{psychologist.description}</Text>}
      </div>

      <Title order={3} mt="md">
        Horarios disponibles
      </Title>
      <Text size="sm" c="dimmed">
        Las horas se muestran en tu zona horaria ({timeZone}).
      </Text>
      <ErrorAlert error={slots.error} />
      {slots.isPending && <Loader />}
      {slots.data && days.length === 0 && <Text c="dimmed">No hay horarios libres por ahora.</Text>}

      {days.map(([key, daySlots]) => (
        <Card key={key} withBorder radius="md" padding="md">
          <Text fw={600} mb="sm">
            {formatDay(daySlots[0].startsAt, timeZone)}
          </Text>
          <Group gap="sm">
            {daySlots.map((slot) => (
              <Button
                key={slot._id}
                variant="light"
                disabled={!user || user.role !== 'paciente' || book.isPending}
                onClick={() => book.mutate(slot._id)}
              >
                {formatTime(slot.startsAt, timeZone)}
              </Button>
            ))}
          </Group>
        </Card>
      ))}

      {user && user.role !== 'paciente' && (
        <Text size="sm" c="dimmed">
          Solo los pacientes pueden reservar citas.
        </Text>
      )}
    </Stack>
  );
}
