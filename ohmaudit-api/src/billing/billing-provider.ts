export interface BillingProvider {
  createCustomer(input: { organisationId: string; name: string; email: string }): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    moduleKeys: string[];
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }>;
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
  verifyWebhook(payload: string, signature: string): Promise<BillingEvent>;
}

export interface BillingEvent {
  id: string;
  type: string;
  payload: unknown;
}
