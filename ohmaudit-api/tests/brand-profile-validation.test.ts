import { describe, expect, it } from 'vitest';
import { brandProfileInput } from '../src/app';

describe('brand profile validation', () => {
  it('accepts blank optional fields and normalises a website without a scheme', () => {
    const result = brandProfileInput.parse({
      tradingName: 'Ohm Electrical',
      registeredName: '',
      addressLine1: '',
      city: '',
      postcode: '',
      telephone: '',
      email: '',
      website: 'ohm.example',
      countryCode: 'GB',
      primaryColour: '#006B66',
      secondaryColour: '#243B53',
      timezone: 'Europe/London',
      dateFormat: 'DD/MM/YYYY',
      onboardingStep: 'accreditations',
    });

    expect(result).toMatchObject({
      tradingName: 'Ohm Electrical',
      website: 'https://ohm.example',
    });
    expect(result.email).toBeUndefined();
    expect(result.addressLine1).toBeUndefined();
  });
});
