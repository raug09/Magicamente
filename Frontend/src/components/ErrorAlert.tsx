import { Alert } from '@mantine/core';
import { ApiError } from '../api/client';

/** Muestra un error del servidor en español, con la lista de campos si la validación falló. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  const message = apiError?.message ?? 'Algo salió mal. Inténtalo de nuevo.';
  return (
    <Alert color="red" title="No se pudo completar" role="alert">
      {message}
      {apiError && apiError.errors.length > 1 && (
        <ul>
          {apiError.errors.map((item) => (
            <li key={`${item.field}-${item.message}`}>{item.message}</li>
          ))}
        </ul>
      )}
    </Alert>
  );
}
