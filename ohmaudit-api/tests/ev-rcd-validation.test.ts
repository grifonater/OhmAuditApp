import { describe, expect, it } from 'vitest';
import { evRcdFailureReasons } from '../src/inspections/inspection.service';

describe('EV RCD validation', () => {
  it('fails 1x readings above 300 ms and 5x readings above 40 ms', () => {
    expect(
      evRcdFailureReasons({
        stableDetails: { chargePoint: { dcRcdType: 'TYPE_B' } },
        connectorTests: [{ rcd1x0Ms: 301, rcd1x180Ms: 300, rcd5x0Ms: 41, rcd5x180Ms: 40 }],
      }),
    ).toHaveLength(2);
  });

  it('accepts RDC-DD ramp readings up to 6 mA and accepts any Type B ramp value', () => {
    const connectorTests = [{ dcRamp0Ma: 6, dcRamp180Ma: 8 }];
    expect(
      evRcdFailureReasons({
        stableDetails: { chargePoint: { dcRcdType: 'RDC_DD' } },
        connectorTests,
      }),
    ).toHaveLength(1);
    expect(
      evRcdFailureReasons({
        stableDetails: { chargePoint: { dcRcdType: 'TYPE_B' } },
        connectorTests,
      }),
    ).toEqual([]);
  });
});
