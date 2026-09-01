export const ramsSchemaVersion = 1 as const;

export interface RamsDocument {
  id: string;
  title: string;
  jobDescription: string;
}

export interface RamsRecommendationRequest {
  schemaVersion: typeof ramsSchemaVersion;
  organisationId: string;
  current: RamsDocument;
  documents: RamsDocument[];
}

export interface RamsRecommendationMatch {
  id: string;
  score: number;
}

export interface RamsRecommendationResponse {
  schemaVersion: typeof ramsSchemaVersion;
  matches: RamsRecommendationMatch[];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDocument(value: unknown): RamsDocument | undefined {
  if (!isRecord(value)) return undefined;
  const { id, title, jobDescription } = value;
  if (
    typeof id !== 'string' ||
    !uuidPattern.test(id) ||
    typeof title !== 'string' ||
    title.length > 160 ||
    typeof jobDescription !== 'string' ||
    jobDescription.length > 20_000
  )
    return undefined;
  return { id, title, jobDescription };
}

export function parseRamsRecommendationRequest(
  value: unknown,
): RamsRecommendationRequest | undefined {
  if (!isRecord(value) || value['schemaVersion'] !== ramsSchemaVersion) return undefined;
  const organisationId = value['organisationId'];
  const current = parseDocument(value['current']);
  const documents = value['documents'];
  if (
    typeof organisationId !== 'string' ||
    !uuidPattern.test(organisationId) ||
    current === undefined ||
    !Array.isArray(documents) ||
    documents.length > 500
  )
    return undefined;
  const parsedDocuments = documents.map(parseDocument);
  if (parsedDocuments.some((document) => document === undefined)) return undefined;
  return {
    schemaVersion: ramsSchemaVersion,
    organisationId,
    current,
    documents: parsedDocuments as RamsDocument[],
  };
}
