export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 502 | 503,
  ) {
    super(message);
  }
}
