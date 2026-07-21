import type { ReactNode } from "react";
import { useIsMobile } from "./useIsMobile";

export function ResponsiveMatchLayout({
  mobile,
  desktop,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
}) {
  return useIsMobile() ? mobile : desktop;
}
