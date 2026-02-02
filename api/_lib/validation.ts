/**
 * API Validation Schemas
 * Zod schemas for validating API request parameters
 */

import { z } from 'zod';

// ================== Common Schemas ==================

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Non-empty string
 */
export const nonEmptyString = z.string().min(1, 'Value cannot be empty');

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

// ================== Anthology Schemas ==================

/**
 * GET /api/anthologies query parameters
 */
export const AnthologiesQuerySchema = PaginationSchema.extend({
  publicOnly: z.coerce.boolean().default(true),
});

export type AnthologiesQuery = z.infer<typeof AnthologiesQuerySchema>;

/**
 * GET /api/anthologies/:slug parameters
 */
export const AnthologyBySlugSchema = z.object({
  slug: nonEmptyString,
});

// ================== Conversation Schemas ==================

/**
 * GET /api/conversations query parameters
 */
export const ConversationsQuerySchema = PaginationSchema.extend({
  anthologyId: uuidSchema.optional(),
});

export type ConversationsQuery = z.infer<typeof ConversationsQuerySchema>;

/**
 * GET /api/conversations/:id parameters
 */
export const ConversationByIdSchema = z.object({
  id: uuidSchema,
});

// ================== Question Schemas ==================

/**
 * GET /api/questions query parameters
 */
export const QuestionsQuerySchema = PaginationSchema.extend({
  conversationId: uuidSchema.optional(),
  anthologyId: uuidSchema.optional(),
});

export type QuestionsQuery = z.infer<typeof QuestionsQuerySchema>;

/**
 * GET /api/questions/:id/responses parameters
 */
export const QuestionResponsesSchema = z.object({
  id: uuidSchema,
});

// ================== Response Schemas ==================

/**
 * GET /api/responses query parameters
 */
export const ResponsesQuerySchema = PaginationSchema.extend({
  conversationId: uuidSchema.optional(),
  anthologyId: uuidSchema.optional(),
  questionId: uuidSchema.optional(),
  narrativeId: uuidSchema.optional(),
  speakerId: uuidSchema.optional(),
});

export type ResponsesQuery = z.infer<typeof ResponsesQuerySchema>;

/**
 * POST /api/responses body
 */
export const CreateResponseSchema = z.object({
  conversationId: uuidSchema,
  respondsToQuestionId: uuidSchema.optional(),
  respondsToResponseId: uuidSchema.optional(),
  respondsToNarrativeId: uuidSchema.optional(),
  speakerName: nonEmptyString,
  speakerText: nonEmptyString,
  pullQuote: z.string().optional(),
  audioStartMs: z.number().int().min(0).optional(),
  audioEndMs: z.number().int().min(0).optional(),
  turnNumber: z.number().int().min(0).optional(),
  medium: z.enum(['audio', 'text']).optional(),
  synchronicity: z.enum(['sync', 'asynchronous']).optional(),
});

export type CreateResponseBody = z.infer<typeof CreateResponseSchema>;

/**
 * PATCH /api/responses/:id body
 */
export const UpdateResponseSchema = z.object({
  speakerText: z.string().optional(),
  pullQuote: z.string().nullable().optional(),
  respondsToNarrativeId: uuidSchema.nullable().optional(),
  audioStartMs: z.number().int().min(0).optional(),
  audioEndMs: z.number().int().min(0).optional(),
});

export type UpdateResponseBody = z.infer<typeof UpdateResponseSchema>;

/**
 * GET /api/responses/:id parameters
 */
export const ResponseByIdSchema = z.object({
  id: uuidSchema,
});

// ================== Narrative Schemas ==================

/**
 * GET /api/narratives query parameters
 */
export const NarrativesQuerySchema = PaginationSchema.extend({
  conversationId: uuidSchema.optional(),
  anthologyId: uuidSchema.optional(),
});

export type NarrativesQuery = z.infer<typeof NarrativesQuerySchema>;

/**
 * GET /api/narratives/:id/responses parameters
 */
export const NarrativeResponsesSchema = z.object({
  id: uuidSchema,
});

// ================== Speaker Schemas ==================

/**
 * GET /api/speakers query parameters
 */
export const SpeakersQuerySchema = PaginationSchema.extend({
  conversationId: uuidSchema.optional(),
  anthologyId: uuidSchema.optional(),
});

export type SpeakersQuery = z.infer<typeof SpeakersQuerySchema>;

/**
 * POST /api/speakers body
 */
export const CreateSpeakerSchema = z.object({
  conversationId: uuidSchema,
  name: nonEmptyString,
  // Optional color overrides (usually auto-generated)
  circleColor: z.string().optional(),
  fadedCircleColor: z.string().optional(),
  quoteRectangleColor: z.string().optional(),
  fadedQuoteRectangleColor: z.string().optional(),
  quoteTextColor: z.string().optional(),
  fadedQuoteTextColor: z.string().optional(),
});

export type CreateSpeakerBody = z.infer<typeof CreateSpeakerSchema>;

/**
 * GET /api/speakers/:id parameters
 */
export const SpeakerByIdSchema = z.object({
  id: uuidSchema,
});

// ================== Graph Load Schemas ==================

/**
 * GET /api/graph/load query parameters
 */
export const GraphLoadQuerySchema = z.object({
  anthologySlug: z.string().optional(),
  anthologyId: uuidSchema.optional(),
});

export type GraphLoadQuery = z.infer<typeof GraphLoadQuerySchema>;

// ================== Helper Functions ==================

/**
 * Parse and validate query parameters
 * Returns the validated data or throws an error with field-level details
 */
export function parseQuery<T extends z.ZodSchema>(
  schema: T,
  query: unknown
): z.infer<T> {
  return schema.parse(query);
}

/**
 * Safely parse query parameters, returning success/error result
 */
export function safeParseQuery<T extends z.ZodSchema>(
  schema: T,
  query: unknown
): z.SafeParseReturnType<unknown, z.infer<T>> {
  return schema.safeParse(query);
}
