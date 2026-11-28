/** Error de negocio con código HTTP. El middleware de errores lo convierte en respuesta JSON. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Detalle opcional (p. ej. la lista de campos inválidos de una validación). */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
