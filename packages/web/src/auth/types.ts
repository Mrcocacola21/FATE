export interface AuthUser {
  id: string;
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
