/** Error de negocio con código HTTP. El middleware de errores lo convierte en respuesta JSON. */
export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
