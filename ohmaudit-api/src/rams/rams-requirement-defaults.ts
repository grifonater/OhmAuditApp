export interface RamsRequirementDefaultsValue {
  ppe: string[];
  tools: string[];
  competencies: string[];
  emergencyArrangements: string[];
  welfare: string[];
  plant: string[];
}

export const BASELINE_RAMS_REQUIREMENT_DEFAULTS: Readonly<RamsRequirementDefaultsValue> = {
  ppe: ['Safety footwear', 'High-visibility clothing'],
  tools: ['Suitable, inspected tools and equipment for the task'],
  competencies: ['Competent and authorised for the assigned work'],
  emergencyArrangements: ['Stop work, make the area safe and follow the site emergency procedure'],
  welfare: ['Confirm suitable welfare facilities before work starts'],
  plant: ['Only trained and authorised persons may operate plant and machinery'],
};

const normalizeList = (value: unknown): string[] => [
  ...new Set(
    (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export function normalizeRamsRequirementDefaults(value: {
  ppe?: unknown;
  tools?: unknown;
  competencies?: unknown;
  emergencyArrangements?: unknown;
  welfare?: unknown;
  plant?: unknown;
}): RamsRequirementDefaultsValue {
  return {
    ppe: normalizeList(value.ppe),
    tools: normalizeList(value.tools),
    competencies: normalizeList(value.competencies),
    emergencyArrangements: normalizeList(value.emergencyArrangements),
    welfare: normalizeList(value.welfare),
    plant: normalizeList(value.plant),
  };
}

export function baselineRamsRequirementDefaults(): RamsRequirementDefaultsValue {
  return normalizeRamsRequirementDefaults(BASELINE_RAMS_REQUIREMENT_DEFAULTS);
}
