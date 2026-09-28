import { createApp } from './app';
import { handleEmailEventQueue } from './email/email-queue';
import type { ApiBindings } from './shared/environment';

const app = createApp();

export default {
  fetch: app.fetch,
  queue: handleEmailEventQueue,
} satisfies ExportedHandler<ApiBindings, unknown>;
