import { logAnalysis } from '../../logger';
import {
  parseRamsRecommendationRequest,
  ramsSchemaVersion,
  type RamsDocument,
  type RamsRecommendationMatch,
} from './schema';

const maximumRequestBytes = 2 * 1024 * 1024;
const maximumProjectionCharacters = 3_000;
const embeddingDimensions = 768;
const embeddingBatchSize = 100;
const vectorQueryTopK = 10;
const maximumMatches = 3;
const defaultSimilarityThreshold = 0.78;

interface RamsAiBinding {
  run(
    model: '@cf/baai/bge-base-en-v1.5',
    input: { text: string[]; pooling: 'cls' },
  ): Promise<unknown>;
}

interface RamsVectorBinding {
  upsert(vectors: VectorizeVector[]): Promise<unknown>;
  query(vector: number[], options: VectorizeQueryOptions): Promise<VectorizeMatches>;
}

export interface RamsRuntimeBindings {
  AI?: RamsAiBinding;
  RAMS_VECTORS?: RamsVectorBinding;
  RAMS_EMBEDDING_MODEL_ID?: '@cf/baai/bge-base-en-v1.5';
  RAMS_SIMILARITY_THRESHOLD?: string;
}

class RequestBodyError extends Error {
  constructor(readonly tooLarge: boolean) {
    super(tooLarge ? 'request_too_large' : 'request_invalid');
  }
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ code, message }, { status });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RequestBodyError(false);
    if (bytes > maximumRequestBytes) throw new RequestBodyError(true);
  }
  if (request.body === null) throw new RequestBodyError(false);

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytesRead = 0;
  let json = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumRequestBytes) {
        await reader.cancel();
        throw new RequestBodyError(true);
      }
      json += decoder.decode(value, { stream: true });
    }
    json += decoder.decode();
    return JSON.parse(json) as unknown;
  } catch (error: unknown) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError(false);
  } finally {
    reader.releaseLock();
  }
}

function projection(document: RamsDocument): string {
  return `${document.title}\n${document.jobDescription}`.slice(0, maximumProjectionCharacters);
}

function validatedEmbeddingResponse(value: unknown, expectedCount: number): number[][] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const response = value as { shape?: unknown; data?: unknown };
  if (
    !Array.isArray(response.shape) ||
    response.shape.length !== 2 ||
    response.shape[0] !== expectedCount ||
    response.shape[1] !== embeddingDimensions ||
    !Array.isArray(response.data) ||
    response.data.length !== expectedCount
  )
    return undefined;
  const vectors: number[][] = [];
  for (const vector of response.data) {
    if (
      !Array.isArray(vector) ||
      vector.length !== embeddingDimensions ||
      vector.some((component) => typeof component !== 'number' || !Number.isFinite(component)) ||
      vector.every((component) => component === 0)
    )
      return undefined;
    vectors.push(vector as number[]);
  }
  return vectors;
}

async function createEmbeddings(
  ai: RamsAiBinding,
  model: '@cf/baai/bge-base-en-v1.5',
  documents: RamsDocument[],
): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let offset = 0; offset < documents.length; offset += embeddingBatchSize) {
    const batch = documents.slice(offset, offset + embeddingBatchSize);
    const result = await ai.run(model, { text: batch.map(projection), pooling: 'cls' });
    const vectors = validatedEmbeddingResponse(result, batch.length);
    if (vectors === undefined) throw new Error('invalid_embedding_response');
    embeddings.push(...vectors);
  }
  return embeddings;
}

function cosineSimilarity(left: number[], right: number[]): number | undefined {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) return undefined;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  if (denominator === 0) return undefined;
  return Math.max(-1, Math.min(1, dot / denominator));
}

function parseThreshold(configured: string): number | undefined {
  const threshold = Number(configured);
  return Number.isFinite(threshold) && threshold >= -1 && threshold <= 1 ? threshold : undefined;
}

function uniqueDocuments(current: RamsDocument, documents: RamsDocument[]): RamsDocument[] {
  const byId = new Map<string, RamsDocument>([[current.id, current]]);
  for (const document of documents) if (!byId.has(document.id)) byId.set(document.id, document);
  return [...byId.values()];
}

function mergeMatches(
  vectorMatches: VectorizeMatch[],
  documents: RamsDocument[],
  embeddings: number[][],
  currentId: string,
  threshold: number,
): RamsRecommendationMatch[] {
  const scores = new Map<string, number>();
  for (const match of vectorMatches) {
    if (
      typeof match.id !== 'string' ||
      typeof match.score !== 'number' ||
      !Number.isFinite(match.score) ||
      match.score < -1 ||
      match.score > 1
    )
      throw new Error('invalid_vector_response');
    if (match.id !== currentId) scores.set(match.id, match.score);
  }

  const currentEmbedding = embeddings[0];
  if (currentEmbedding === undefined) throw new Error('current_embedding_missing');
  for (let index = 1; index < documents.length; index += 1) {
    const document = documents[index];
    const embedding = embeddings[index];
    if (document === undefined || embedding === undefined || scores.has(document.id)) continue;
    const score = cosineSimilarity(currentEmbedding, embedding);
    if (score !== undefined) scores.set(document.id, score);
  }

  return [...scores]
    .filter(([, score]) => score >= threshold)
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, maximumMatches);
}

export async function recommendRams(request: Request, env: RamsRuntimeBindings): Promise<Response> {
  const correlationId = request.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const startedAt = Date.now();
  const threshold =
    env.RAMS_SIMILARITY_THRESHOLD === undefined
      ? defaultSimilarityThreshold
      : parseThreshold(env.RAMS_SIMILARITY_THRESHOLD);
  if (
    env.AI === undefined ||
    env.RAMS_VECTORS === undefined ||
    env.RAMS_EMBEDDING_MODEL_ID === undefined ||
    threshold === undefined
  ) {
    logAnalysis('error', 'ai.rams.not_configured', { correlationId });
    return errorResponse(
      'RAMS_NOT_CONFIGURED',
      'RAMS recommendations are not configured. Please contact support.',
      503,
    );
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json')
    return errorResponse('RAMS_REQUEST_INVALID', 'Send a valid JSON request.', 415);

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error: unknown) {
    const tooLarge = error instanceof RequestBodyError && error.tooLarge;
    logAnalysis('warn', 'ai.rams.request_rejected', {
      correlationId,
      requestBytes: Number(request.headers.get('content-length') ?? 0),
    });
    return errorResponse(
      tooLarge ? 'RAMS_REQUEST_TOO_LARGE' : 'RAMS_REQUEST_INVALID',
      tooLarge ? 'The request must be 2 MB or smaller.' : 'Send a valid JSON request.',
      tooLarge ? 413 : 422,
    );
  }
  const input = parseRamsRecommendationRequest(body);
  if (input === undefined) {
    logAnalysis('warn', 'ai.rams.request_rejected', { correlationId });
    return errorResponse(
      'RAMS_REQUEST_INVALID',
      'The RAMS recommendation request is invalid.',
      422,
    );
  }

  const documents = uniqueDocuments(input.current, input.documents);
  let embeddings: number[][];
  try {
    embeddings = await createEmbeddings(env.AI, env.RAMS_EMBEDDING_MODEL_ID, documents);
  } catch {
    logAnalysis('error', 'ai.rams.inference_failed', {
      correlationId,
      organisationId: input.organisationId,
      currentId: input.current.id,
      documentCount: documents.length,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(
      'RAMS_INFERENCE_FAILED',
      'The recommendation service is temporarily unavailable.',
      502,
    );
  }

  const vectors: VectorizeVector[] = documents.map((document, index) => ({
    id: document.id,
    values: embeddings[index] ?? [],
    namespace: input.organisationId,
    metadata: { sourceId: document.id, schemaVersion: ramsSchemaVersion },
  }));
  let vectorMatches: VectorizeMatch[];
  try {
    await env.RAMS_VECTORS.upsert(vectors);
    const query = await env.RAMS_VECTORS.query(embeddings[0] ?? [], {
      namespace: input.organisationId,
      topK: vectorQueryTopK,
      returnValues: false,
      returnMetadata: 'none',
    });
    if (!Array.isArray(query.matches)) throw new Error('invalid_vector_response');
    vectorMatches = query.matches;
  } catch {
    logAnalysis('error', 'ai.rams.index_failed', {
      correlationId,
      organisationId: input.organisationId,
      currentId: input.current.id,
      vectorCount: vectors.length,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(
      'RAMS_INDEX_FAILED',
      'The recommendation index is temporarily unavailable.',
      502,
    );
  }

  let matches: RamsRecommendationMatch[];
  try {
    matches = mergeMatches(vectorMatches, documents, embeddings, input.current.id, threshold);
  } catch {
    logAnalysis('error', 'ai.rams.index_failed', {
      correlationId,
      organisationId: input.organisationId,
      currentId: input.current.id,
      vectorCount: vectors.length,
      durationMs: Date.now() - startedAt,
    });
    return errorResponse(
      'RAMS_INDEX_FAILED',
      'The recommendation index is temporarily unavailable.',
      502,
    );
  }

  logAnalysis('info', 'ai.rams.completed', {
    correlationId,
    organisationId: input.organisationId,
    currentId: input.current.id,
    documentCount: documents.length,
    vectorMatchCount: vectorMatches.length,
    matchCount: matches.length,
    durationMs: Date.now() - startedAt,
  });
  return Response.json({ schemaVersion: ramsSchemaVersion, matches });
}
