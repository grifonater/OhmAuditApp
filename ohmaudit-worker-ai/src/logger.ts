export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Emits a single structured JSON line for Cloudflare observability.
 * The event name keeps logs from different features distinguishable.
 */
export function logAnalysis(
  level: LogLevel,
  event: string,
  details: Record<string, unknown>,
): void {
  const message = JSON.stringify({ event, ...details });
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}
