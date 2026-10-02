export type AuthLock = <T>(operation: () => Promise<T>) => Promise<T>;

export const withAuthLock: AuthLock = async (operation) => {
  // Serialize all refresh-cookie mutations across same-origin tabs, including sign-in/out.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("fate-auth-refresh", operation);
  }
  return operation();
};
