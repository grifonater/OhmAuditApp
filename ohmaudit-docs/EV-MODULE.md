# EV Charging module

One EV charge point is one Asset. Extension entities model charge point, supplies, connectors, and connector-to-supply mappings, supporting shared and independent supplies without duplicate certificates.

Stable asset information is confirmed and reused; measured inspection results are never copied forward. Validation depends on versioned protection/test configuration and contains no invented regulatory thresholds. Remote CPMS commands require provider capability, organisation policy, user permission, assignment scope, and complete audit records.

The current workflow stores make, model, serial number, unit power output, and DC protection at charger level. Supplies hold phase, protective-device, rating, and earthing-arrangement data. Connectors hold only connector-specific identity and many-to-many supply mappings; serial and power are deliberately not duplicated on connectors.

Engineer testing is supply-first: Zs and maximum PFC are recorded against every supply. Each connector then records PE pre-test, CP error, PE error, CP states, 1x RCD trips at 0/180 degrees, 5x trips at 0/180 degrees, and conditional DC ramp readings. Type B RCD and RDC-DD enable ramp entry; None suppresses it. Condition comments, defects, and photographs are preserved with the inspection revision.

Stable field corrections are submitted as a Proposed Asset Change. Office reviewers can compare the proposal with the inspection, apply it to the digital twin, or reject it. Measured results remain immutable and are never copied into the stable asset record.
