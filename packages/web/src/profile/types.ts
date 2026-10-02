import type { Language } from "../i18n";
import type { Theme } from "../theme";

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}
export interface OwnProfile extends PublicProfile {
  email: string;
  preferredLanguage: Language;
  preferredTheme: Theme;
  updatedAt: string;
}
export type ProfilePatch = Partial<
  Pick<
    OwnProfile,
    "username" | "displayName" | "avatarUrl" | "preferredLanguage" | "preferredTheme"
  >
>;
export interface ProfileApi {
  getOwn(): Promise<OwnProfile>;
  updateOwn(patch: ProfilePatch): Promise<OwnProfile>;
  getPublic(username: string): Promise<PublicProfile>;
}
