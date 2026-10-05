import { AppError } from "../errors/appError";

export const authErrors = {
  VALIDATION_ERROR: [400, "Request validation failed."],
  UNAUTHORIZED: [401, "Authentication required"],
  FORBIDDEN: [403, "Insufficient permissions"],
  ACCOUNT_BLOCKED: [403, "Account access is blocked"],
  CANNOT_BLOCK_SELF: [403, "Cannot block your own account"],
  CANNOT_CHANGE_OWN_ROLE: [403, "Cannot change your own role"],
  INSUFFICIENT_TARGET_ROLE: [403, "Cannot moderate this account role"],
  LAST_ADMIN_PROTECTED: [409, "The last active administrator is protected"],
  BLOCKED_ROLE_TARGET: [409, "Unblock the account before assigning a privileged role"],
  MATCH_NOT_FOUND: [404, "Match not found"],
  USER_NOT_FOUND: [404, "User not found"],
  INVALID_CREDENTIALS: [401, "Invalid email or password"],
  INVALID_REFRESH_TOKEN: [401, "Invalid refresh credentials"],
  FORBIDDEN_ORIGIN: [403, "Untrusted request origin"],
  EMAIL_ALREADY_REGISTERED: [409, "Email already registered"],
  USERNAME_ALREADY_TAKEN: [409, "Username already taken"],
  RATE_LIMITED: [429, "Too many requests."],
  INTERNAL_SERVER_ERROR: [500, "An unexpected server error occurred."],
  DATABASE_UNAVAILABLE: [503, "Database unavailable"],
  AUTH_UNAVAILABLE: [503, "Authentication is not configured"],
} as const;

export type AuthErrorCode = keyof typeof authErrors;

export class AuthError extends AppError {
  constructor(readonly code: AuthErrorCode) {
    const [statusCode, message] = authErrors[code];
    super(code, statusCode, message);
  }
}
