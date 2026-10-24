import type { Language } from "../i18n/registry";
import type { Theme } from "../theme";

export interface AuthUser {
  id: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
export interface RegisterInput extends LoginInput {
  username: string;
  /** The guest's current UI choice; otherwise the new profile starts as en/light. */
  preferredLanguage?: Language;
  preferredTheme?: Theme;
}
export interface AccessCredentials {
  accessToken: string;
  accessTokenExpiresIn: number;
}
export interface AccountCredentials extends AccessCredentials {
  user: AuthUser;
}

export interface AuthApi {
  login(input: LoginInput): Promise<AccountCredentials>;
  register(input: RegisterInput): Promise<AccountCredentials>;
  refresh(): Promise<AccessCredentials>;
  logout(): Promise<void>;
  getMe(token: string): Promise<AuthUser>;
}
