export class AppError extends Error {
  constructor(message, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error) {
  if (error instanceof AppError) return error;
  return new AppError(error?.message || 'حدث خطأ غير متوقع.', error?.name || 'UNKNOWN', error);
}
