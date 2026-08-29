export const dataPlateDebugModels = [
  '@cf/moondream/moondream3.1-9B-A2B',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
] as const;

export type DataPlateDebugModel = (typeof dataPlateDebugModels)[number];

export function isDataPlateDebugModel(value: string): value is DataPlateDebugModel {
  return dataPlateDebugModels.some((model) => model === value);
}
