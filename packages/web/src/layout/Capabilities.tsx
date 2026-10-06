import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getServerCapabilities, type ServerCapabilities } from "../api";

// Fail closed until the server explicitly enables developer tools. Share the
// request across StrictMode mounts as well as every consumer of the shell.
let request: Promise<ServerCapabilities> | undefined;
const CapabilitiesContext = createContext<ServerCapabilities | null>(null);

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<ServerCapabilities | null>(null);
  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      request ??= getServerCapabilities().catch((error) => {
        // The backend may still be starting alongside Vite in `npm run dev`.
        // Share in-flight requests, but allow a failed request to be retried.
        request = undefined;
        throw error;
      });
      request.then(
        (value) => {
          if (active) setCapabilities(value);
        },
        () => {
          if (!active) return;
          setCapabilities({ testRooms: { enabled: false, requiresToken: false } });
          retry = setTimeout(load, 5000);
        },
      );
    };
    load();
    return () => {
      active = false;
      clearTimeout(retry);
    };
  }, []);
  return (
    <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>
  );
}

export function useCapabilities() {
  return useContext(CapabilitiesContext);
}
