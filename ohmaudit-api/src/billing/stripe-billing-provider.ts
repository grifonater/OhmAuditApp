import type { BillingEvent, BillingProvider } from './billing-provider';

/** Stripe remains isolated behind this adapter. Network calls are enabled once live price IDs are configured. */
export class StripeBillingProvider implements BillingProvider {
  createCustomer(): Promise<string> {
    return Promise.reject(
      new Error('Stripe billing is not configured. Trial access remains active.'),
    );
  }
  createCheckoutSession(): Promise<{ url: string }> {
    return Promise.reject(new Error('Stripe billing is not configured.'));
  }
  createPortalSession(): Promise<{ url: string }> {
    return Promise.reject(new Error('Stripe billing is not configured.'));
  }
  verifyWebhook(): Promise<BillingEvent> {
    return Promise.reject(new Error('Stripe webhook verification is not configured.'));
  }
}
