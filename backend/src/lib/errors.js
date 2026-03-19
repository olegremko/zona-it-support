export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function notFound(message = 'Not found') {
  return new AppError(404, message);
}

export function forbidden(message = 'Forbidden') {
  return new AppError(403, message);
}

export function badRequest(message = 'Bad request', details) {
  return new AppError(400, message, details);
}

export function unauthorized(message = 'Unauthorized') {
  return new AppError(401, message);
}
