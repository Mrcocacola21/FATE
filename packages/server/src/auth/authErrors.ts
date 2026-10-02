export const authErrors = {
  INVALID_REQUEST: [400, "Invalid request"],
  UNAUTHORIZED: [401, "Authentication required"],
  INVALID_CREDENTIALS: [401, "Invalid email or password"],
  INVALID_REFRESH_TOKEN: [401, "Invalid refresh credentials"],
  FORBIDDEN_ORIGIN: [403, "Untrusted request origin"],
  EMAIL_ALREADY_REGISTERED: [409, "Email already registered"],
  USERNAME_ALREADY_TAKEN: [409, "Username already taken"],
  RATE_LIMITED: [429, "Too many authentication requests"],
  INTERNAL_ERROR: [500, "Internal server error"],
  DATABASE_UNAVAILABLE: [503, "Database unavailable"],
  AUTH_UNAVAILABLE: [503, "Authentication is not configured"],
} as const;

export type AuthErrorCode = keyof typeof authErrors;

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(readonly code: AuthErrorCode) {
    const [statusCode, message] = authErrors[code];
    super(message);
    this.statusCode = statusCode;
  }

  toResponse() {
    return { error: { code: this.code, message: this.message } };
  }
}
