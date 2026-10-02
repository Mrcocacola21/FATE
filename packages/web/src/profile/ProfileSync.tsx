import { useEffect } from "react";
import { useAuthStore } from "../auth/authStore";
import { profileStore } from "./profileStore";

export function ProfileSync() {
  const id = useAuthStore((state) => (state.status === "authenticated" ? state.user?.id : null));
  useEffect(() => {
    if (id) void profileStore.getState().load();
  }, [id]);
  return null;
}
