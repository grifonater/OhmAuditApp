import { describe, expect, it } from 'vitest';
import { requestPdfRender } from '../src/app';
import type { ApiBindings } from '../src/shared/environment';

describe('PDF renderer boundary', () => {
  it('returns a useful service error when the renderer cannot be reached', async () => {
    const environment = {
      PDF_WORKER: {
        fetch: () => Promise.reject(new Error('connection refused')),
      },
    } as unknown as ApiBindings;

    await expect(
      requestPdfRender(environment, '/render/test', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toMatchObject({
      code: 'PDF_RENDERER_UNREACHABLE',
      status: 503,
      message: 'The PDF renderer is unavailable. Start the PDF worker and try again.',
    });
  });

  it('preserves a useful validation message from the renderer', async () => {
    const environment = {
      PDF_WORKER: {
        fetch: () =>
          Promise.resolve(
            Response.json({ message: 'The certificate payload is invalid.' }, { status: 422 }),
          ),
      },
    } as unknown as ApiBindings;

    await expect(
      requestPdfRender(environment, '/render/test', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toMatchObject({
      code: 'PDF_RENDER_FAILED',
      status: 422,
      message: 'The certificate payload is invalid.',
    });
  });
});
