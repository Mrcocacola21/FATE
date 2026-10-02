import { useStore } from "zustand";
import { authStore } from "../auth/authStore";
import { profileApi } from "../api/profileApi";
import { setLanguage, type Language } from "../i18n";
import { setTheme, type Theme } from "../theme";
import { createProfileStore, type ProfileState } from "./createProfileStore";

export const profileStore = createProfileStore(profileApi, authStore, (profile) => {
  setLanguage(profile.preferredLanguage);
  setTheme(profile.preferredTheme);
});
export const useProfileStore = <T>(selector: (state: ProfileState) => T): T =>
  useStore(profileStore, selector);

export async function changePreference(patch: {
  preferredLanguage?: Language;
  preferredTheme?: Theme;
}) {
  if (authStore.getState().status === "authenticated") {
    await profileStore.getState().save(patch);
  } else {
    if (patch.preferredLanguage) setLanguage(patch.preferredLanguage);
    if (patch.preferredTheme) setTheme(patch.preferredTheme);
  }
}
