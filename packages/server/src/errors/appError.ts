export type ErrorDetails = Record<string, unknown>;

/** Expected application failures contain only explicitly safe public metadata. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = "AppError";
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const internalError = () =>
  new AppError("INTERNAL_SERVER_ERROR", 500, "An unexpected server error occurred.");
