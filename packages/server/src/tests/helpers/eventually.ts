/** Bounded polling for durable state; interval is scheduling, never an assertion of elapsed time. */
export async function eventually<T>(read: () => Promise<T | false | undefined>, description: string, timeoutMs = 10000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== false && value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out awaiting ${description}`);
}
