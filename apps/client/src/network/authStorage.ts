const AUTH_TOKEN_KEY = "vtt_auth_token";

export function getSavedAuthToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function saveAuthToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}
