import type { EmailAuditStatus, Prisma, PrismaClient } from '../generated/prisma/client';
import { DomainError } from '../shared/domain-error';
import type { ParsedEmailEvent } from './email-event';

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

interface EmailSenderConfig {
  binding: SendEmail;
  fromAddress?: string;
  fromName?: string;
}

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  actorUserId?: string;
}

function sendError(error: unknown): { code?: string; message: string } {
  if (!(error instanceof Error)) return { message: String(error) };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return { ...(code === undefined ? {} : { code }), message: error.message };
}

export class EmailAuditService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender?: EmailSenderConfig,
  ) {}

  async send(input: SendEmailInput) {
    if (this.sender === undefined)
      throw new DomainError('EMAIL_NOT_CONFIGURED', 'Email sending is not configured.', 503);
    const recipients = Array.isArray(input.to) ? input.to : [input.to];
    const fromAddress = this.sender.fromAddress ?? 'noreply@ohmaudit.com';
    const fromName = this.sender.fromName ?? 'Ohm Audit';
    const audit = await this.prisma.emailAudit.create({
      data: {
        fromAddress,
        fromName,
        toAddresses: recipients,
        subject: input.subject,
        ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
      },
    });

    let messageId: string;
    try {
      const result = await this.sender.binding.send({
        to: recipients,
        from: { email: fromAddress, name: fromName },
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      messageId = result.messageId;
    } catch (error: unknown) {
      const failure = sendError(error);
      await this.prisma.emailAudit.update({
        where: { id: audit.id },
        data: {
          status: 'FAILED',
          statusReason:
            failure.code === undefined ? failure.message : `${failure.code}: ${failure.message}`,
          failedAt: new Date(),
        },
      });
      throw new DomainError('EMAIL_SEND_FAILED', 'The email could not be sent.', 502);
    }
    return this.prisma.emailAudit.update({
      where: { id: audit.id },
      data: { messageId, status: 'SENT', sentAt: new Date() },
    });
  }

  async list(status: EmailAuditStatus | undefined, search: string, page: number, pageSize: number) {
    const where: Prisma.EmailAuditWhereInput = {
      ...(status === undefined ? {} : { status }),
      ...(search === ''
        ? {}
        : {
            OR: [
              { subject: { contains: search, mode: 'insensitive' } },
              { fromAddress: { contains: search, mode: 'insensitive' } },
              { messageId: { contains: search, mode: 'insensitive' } },
              { toAddresses: { has: search } },
            ],
          }),
    };
    const [items, total] = await Promise.all([
      this.prisma.emailAudit.findMany({
        where,
        include: { actor: { select: { id: true, email: true, displayName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.emailAudit.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async detail(id: string) {
    const audit = await this.prisma.emailAudit.findUnique({
      where: { id },
      include: {
        actor: { select: { id: true, email: true, displayName: true } },
        events: { orderBy: { occurredAt: 'desc' } },
      },
    });
    if (audit === null)
      throw new DomainError('EMAIL_AUDIT_NOT_FOUND', 'The email audit was not found.', 404);
    if (audit.createdAt.getTime() < Date.now() - sevenDaysMs)
      throw new DomainError(
        'EMAIL_AUDIT_DETAIL_EXPIRED',
        'Detailed email metadata is available for seven days.',
        410,
      );
    return audit;
  }

  async recordEvent(event: ParsedEmailEvent): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        if (await transaction.emailAuditEvent.findUnique({ where: { eventId: event.eventId } }))
          return;
        const audit = await transaction.emailAudit.findUnique({
          where: { messageId: event.messageId },
          select: { id: true },
        });
        if (audit === null) throw new Error(`Email audit not found for message ${event.messageId}`);
        await transaction.emailAuditEvent.create({
          data: {
            emailAuditId: audit.id,
            eventId: event.eventId,
            messageId: event.messageId,
            eventType: event.eventType,
            status: event.status,
            ...(event.reason === undefined ? {} : { reason: event.reason }),
            ...(event.smtpStatusCode === undefined ? {} : { smtpStatusCode: event.smtpStatusCode }),
            ...(event.smtpEnhancedStatus === undefined
              ? {}
              : { smtpEnhancedStatus: event.smtpEnhancedStatus }),
            ...(event.smtpResponse === undefined ? {} : { smtpResponse: event.smtpResponse }),
            metadata: event.metadata,
            occurredAt: event.occurredAt,
          },
        });
        const terminalFailure = ['BOUNCED', 'FAILED', 'REJECTED'].includes(event.status);
        await transaction.emailAudit.updateMany({
          where: {
            id: audit.id,
            OR: [{ lastEventAt: null }, { lastEventAt: { lte: event.occurredAt } }],
          },
          data: {
            status: event.status,
            statusReason: event.reason ?? null,
            smtpStatusCode: event.smtpStatusCode ?? null,
            smtpEnhancedStatus: event.smtpEnhancedStatus ?? null,
            smtpResponse: event.smtpResponse ?? null,
            lastEventAt: event.occurredAt,
            ...(event.status === 'DELIVERED' ? { deliveredAt: event.occurredAt } : {}),
            ...(terminalFailure ? { failedAt: event.occurredAt } : {}),
          },
        });
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        return;
      throw error;
    }
  }
}
