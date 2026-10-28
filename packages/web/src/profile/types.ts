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
  /** Who may send this player friend requests. */
  friendRequests: "EVERYONE" | "NOBODY";
  updatedAt: string;
}
export type ProfilePatch = Partial<
  Pick<
    OwnProfile,
    | "username"
    | "displayName"
    | "avatarUrl"
    | "preferredLanguage"
    | "preferredTheme"
    | "friendRequests"
  >
>;
export interface ProfileApi {
  getOwn(): Promise<OwnProfile>;
  updateOwn(patch: ProfilePatch): Promise<OwnProfile>;
  /** Raw PNG, JPEG or WebP; the server stores it and points avatarUrl at it. */
  uploadAvatar(image: Blob): Promise<OwnProfile>;
  getPublic(username: string): Promise<PublicProfile>;
}
