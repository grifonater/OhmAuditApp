export function authorizationUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/$/u, '')}${path}`;
}
