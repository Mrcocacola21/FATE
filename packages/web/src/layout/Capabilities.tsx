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
    request ??= getServerCapabilities();
    request.then(
      (value) => {
        if (active) setCapabilities(value);
      },
      () => {
        if (active) setCapabilities({ testRooms: { enabled: false, requiresToken: false } });
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <CapabilitiesContext.Provider value={capabilities}>{children}</CapabilitiesContext.Provider>
  );
}

export function useCapabilities() {
  return useContext(CapabilitiesContext);
}
