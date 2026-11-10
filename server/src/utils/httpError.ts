export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, details);
export const unauthorized = (message = "Not authenticated") => new HttpError(401, message);
export const forbidden = (message = "Access denied") => new HttpError(403, message);
export const notFound = (message = "Resource not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
