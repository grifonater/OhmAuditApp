import { z } from 'zod';

const graphQlResponse = z.object({
  data: z
    .object({
      viewer: z.object({
        zones: z.array(
          z.object({
            emailSendingAdaptive: z.array(
              z.object({
                datetime: z.string(),
                from: z.string().optional(),
                to: z.string().optional(),
                subject: z.string().optional(),
                status: z.string().optional(),
                eventType: z.string().optional(),
                sendingDomain: z.string().optional(),
                messageId: z.string().optional(),
                errorCause: z.string().optional(),
                errorDetail: z.string().optional(),
                dkim: z.string().optional(),
                dmarc: z.string().optional(),
                spf: z.string().optional(),
                isSpam: z.number().optional(),
              }),
            ),
          }),
        ),
      }),
    })
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export async function emailSendingMetadata(
  token: string | undefined,
  zoneId: string | undefined,
  messageId: string | null,
  createdAt: Date,
) {
  if (token === undefined || zoneId === undefined || messageId === null)
    return { configured: token !== undefined && zoneId !== undefined, events: [] };
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query EmailAuditDetail($zoneTag: string!, $messageId: string!, $start: Time!, $end: Time!) {
        viewer { zones(filter: { zoneTag: $zoneTag }) {
          emailSendingAdaptive(filter: { messageId: $messageId, datetime_geq: $start, datetime_leq: $end }, limit: 100, orderBy: [datetime_DESC]) {
            datetime from to subject status eventType sendingDomain messageId errorCause errorDetail dkim dmarc spf isSpam
          }
        } }
      }`,
        variables: {
          zoneTag: zoneId,
          messageId,
          start: createdAt.toISOString(),
          end: new Date().toISOString(),
        },
      }),
    });
    if (!response.ok)
      return {
        configured: true,
        events: [],
        error: `Cloudflare returned HTTP ${response.status}.`,
      };
    const parsed = graphQlResponse.safeParse(await response.json());
    if (!parsed.success)
      return { configured: true, events: [], error: 'Cloudflare returned an invalid response.' };
    if (parsed.data.errors?.length)
      return {
        configured: true,
        events: [],
        error: parsed.data.errors.map(({ message }) => message).join('; '),
      };
    return {
      configured: true,
      events:
        parsed.data.data?.viewer.zones.flatMap(({ emailSendingAdaptive }) =>
          emailSendingAdaptive.filter((event) => event.messageId === messageId),
        ) ?? [],
    };
  } catch {
    return { configured: true, events: [], error: 'Cloudflare email metadata is unavailable.' };
  }
}
