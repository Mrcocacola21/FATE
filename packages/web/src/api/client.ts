export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number = 0,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type Decoder<T> = (value: unknown) => T;
export type ApiClient = ReturnType<typeof createApiClient>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Only the canonical envelope is accepted; proxy text and legacy shapes stay private. */
export function parseApiError(body: unknown, status: number): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, details } = body.error;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code) &&
      typeof message === "string" && message.length > 0 &&
      (details === undefined || isRecord(details)))
      return new ApiError(code, status, message, details);
  }
  return new ApiError("SERVER_ERROR", status, "Unable to complete the request. Please try again.");
}

export function validationFields(error: unknown): { path: string; message: string }[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR" ||
    !Array.isArray(error.details?.fields)) return [];
  return error.details.fields.flatMap(field =>
    isRecord(field) && typeof field.path === "string" && typeof field.message === "string"
      ? [{ path: field.path, message: field.message }] : [],
  );
}

export function createApiClient(
  baseUrl: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  return {
    async request<T>(path: string, decode: Decoder<T>, options: RequestInit = {}): Promise<T> {
      // Restrict the helper to this backend; credentials must never be forwarded to arbitrary URLs.
      if (!path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) {
        throw new ApiError("INVALID_REQUEST");
      }
      let response: Response;
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 15000);
      const headers = new Headers(options.headers);
      if (options.body && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      try {
        response = await fetcher(`${baseUrl.replace(/\/$/, "")}${path}`, {
          ...options,
          headers,
          credentials: "include",
          signal: options.signal ?? timeout.signal,
        });
        let body: unknown;
        if (response.status !== 204 || !response.ok) {
          try {
            body = await response.json();
          } catch {
            if (!response.ok) throw parseApiError(undefined, response.status);
            throw new ApiError("INVALID_RESPONSE", response.status);
          }
        }
        if (!response.ok) {
          throw parseApiError(body, response.status);
        }
        try {
          return decode(body);
        } catch {
          throw new ApiError("INVALID_RESPONSE", response.status);
        }
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError("NETWORK_ERROR");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
