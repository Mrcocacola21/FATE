export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number = 0,
  ) {
    // Never store arbitrary server response text, URLs, credentials or request bodies.
    super(code);
  }
}

export type Decoder<T> = (value: unknown) => T;
export type ApiClient = ReturnType<typeof createApiClient>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
        if (response.status === 204 && response.ok) return decode(undefined);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new ApiError(response.ok ? "INVALID_RESPONSE" : "SERVER_ERROR", response.status);
        }
        if (!response.ok) {
          const code =
            isRecord(body) && isRecord(body.error) && typeof body.error.code === "string"
              ? body.error.code
              : "SERVER_ERROR";
          throw new ApiError(code, response.status);
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
