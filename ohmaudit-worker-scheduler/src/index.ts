export interface SchedulerBindings {
  APP_ENV: 'local' | 'development' | 'staging' | 'production';
  APP_VERSION: string;
  SCHEDULE_HORIZON_YEARS: string;
  API_BASE_URL?: string;
  INTERNAL_SERVICE_TOKEN?: string;
}

export function schedulerHealth(version: string): Response {
  return Response.json({ service: 'ohmaudit-worker-scheduler', status: 'ok', version });
}

export default {
  fetch(_request: Request, env: SchedulerBindings): Response {
    return schedulerHealth(env.APP_VERSION);
  },
  async scheduled(_controller: ScheduledController, env: SchedulerBindings): Promise<void> {
    if (env.API_BASE_URL === undefined || env.INTERNAL_SERVICE_TOKEN === undefined) {
      console.warn(JSON.stringify({ event: 'scheduler.not_configured', environment: env.APP_ENV }));
      return;
    }
    const response = await fetch(`${env.API_BASE_URL}/internal/scheduler/tick`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
    });
    if (!response.ok) throw new Error(`Scheduler API returned ${response.status}.`);
    console.info(
      JSON.stringify({
        event: 'scheduler.tick_complete',
        environment: env.APP_ENV,
        result: await response.json(),
      }),
    );
  },
} satisfies ExportedHandler<SchedulerBindings>;
