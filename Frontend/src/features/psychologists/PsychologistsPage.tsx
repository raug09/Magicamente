import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Anchor, Card, Group, Loader, Pagination, Stack, Text, TextInput, Title, Badge } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { request } from '../../api/client';
import type { Page, PublicPsychologist } from '../../api/types';
import { ErrorAlert } from '../../components/ErrorAlert';

const PAGE_SIZE = 10;

export function PsychologistsPage() {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['psychologists', debounced, page],
    queryFn: () =>
      request<Page<PublicPsychologist>>('/api/psychologists', { query: { q: debounced || undefined, page, limit: PAGE_SIZE } }),
    placeholderData: (previous) => previous,
  });

  return (
    <Stack>
      <Title order={2}>Psicólogos</Title>
      <TextInput
        placeholder="Buscar por nombre"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
          setPage(1);
        }}
        maw={420}
      />
      <ErrorAlert error={query.error} />
      {query.isPending && <Loader />}
      {query.data && query.data.items.length === 0 && <Text c="dimmed">No encontramos psicólogos con ese nombre.</Text>}
      {query.data?.items.map((psychologist) => (
        <Card key={psychologist._id} withBorder padding="lg" radius="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Anchor component={Link} to={`/psicologos/${psychologist._id}`} fw={600} size="lg">
                {psychologist.name}
              </Anchor>
              {psychologist.studies && psychologist.studies.length > 0 && (
                <Group gap={6}>
                  {psychologist.studies.map((study) => (
                    <Badge key={study} variant="light">
                      {study}
                    </Badge>
                  ))}
                </Group>
              )}
              {psychologist.description && (
                <Text size="sm" c="dimmed" lineClamp={2}>
                  {psychologist.description}
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      ))}
      {query.data && query.data.pages > 1 && <Pagination total={query.data.pages} value={page} onChange={setPage} mt="md" />}
    </Stack>
  );
}
