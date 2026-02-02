# Data Layer API Implementation

**Status: IMPLEMENTED** (January 30, 2025)

This document describes the REST API data layer that replaces direct Supabase calls from the frontend.

---

## Summary

The API layer has been implemented following the original proposal. All core read operations now flow through REST API endpoints, improving security and maintainability.

### What's Implemented

**Phase 1: Infrastructure** ✅
- `api/_lib/supabase.ts` - Server-side Supabase client with service role key
- `api/_lib/response.ts` - Standardized JSON responses with pagination
- `api/_lib/errors.ts` - Error types, codes, and ApiException class
- `api/_lib/validation.ts` - Zod schemas for all request parameters
- `api/_lib/auth.ts` - JWT authentication helpers
- `shared/types/api.types.ts` - Shared TypeScript types

**Phase 2: Read Endpoints** ✅
- `GET /api/anthologies` - List public anthologies
- `GET /api/anthologies/:slug` - Get anthology by slug
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id` - Get conversation by ID
- `GET /api/conversations/:id/speakers` - Get conversation speakers
- `GET /api/conversations/:id/questions` - Get conversation questions
- `GET /api/conversations/:id/responses` - Get conversation responses
- `GET /api/conversations/:id/narratives` - Get conversation narratives
- `GET /api/questions` - List questions
- `GET /api/questions/:id/responses` - Get question responses
- `GET /api/responses` - List responses
- `GET /api/responses/:id` - Get response by ID
- `GET /api/responses/:id/word-timestamps` - Get word timestamps
- `GET /api/narratives` - List narratives
- `GET /api/narratives/:id/responses` - Get narrative responses
- `GET /api/speakers` - List speakers
- `GET /api/speakers/:id` - Get speaker by ID
- `GET /api/graph/load` - Composite endpoint for visualization data

**Phase 3: Write Endpoints** ✅
- `POST /api/responses` - Create response (requires auth)
- `PATCH /api/responses/:id` - Update response (requires auth)
- `DELETE /api/responses/:id` - Delete response (requires auth)
- `POST /api/speakers` - Create speaker (requires auth)

**Phase 4: Frontend Migration** ✅
- `src/services/apiClient.ts` - New API client with fetch()
- `src/services/anthologyService.ts` - Uses REST API
- `src/services/conversationService.ts` - Uses REST API
- `src/services/questionService.ts` - Uses REST API
- `src/services/responseService.ts` - Uses REST API
- `src/services/narrativeService.ts` - Uses REST API
- `src/services/speakerService.ts` - Uses REST API
- `src/services/graphDataService.ts` - Uses REST API

**Phase 5: Documentation** ✅
- `docs/api/openapi.yaml` - OpenAPI 3.0 specification
- `api/docs/index.ts` - Swagger UI endpoint at /api/docs
- npm scripts: `api:validate`, `api:types`

### Not Yet Migrated

These services still use direct Supabase calls for file uploads and complex write operations:
- `recordingService.ts` - File uploads to Supabase Storage
- `adminService.ts` - Complex CRUD with multiple tables
- `conversationUploadService.ts` - Bulk file uploads

---

## API Structure

```
api/
├── _lib/                          # Shared utilities
│   ├── supabase.ts                # Server-side client (service key)
│   ├── response.ts                # Standardized JSON responses
│   ├── errors.ts                  # Error types and handling
│   ├── validation.ts              # Zod schemas
│   └── auth.ts                    # JWT authentication
│
├── anthologies/
│   ├── index.ts                   GET /api/anthologies
│   └── [slug].ts                  GET /api/anthologies/:slug
│
├── conversations/
│   ├── index.ts                   GET /api/conversations
│   ├── [id].ts                    GET /api/conversations/:id
│   └── [id]/
│       ├── speakers.ts            GET /api/conversations/:id/speakers
│       ├── questions.ts           GET /api/conversations/:id/questions
│       ├── responses.ts           GET /api/conversations/:id/responses
│       └── narratives.ts          GET /api/conversations/:id/narratives
│
├── questions/
│   ├── index.ts                   GET /api/questions
│   └── [id]/
│       └── responses.ts           GET /api/questions/:id/responses
│
├── responses/
│   ├── index.ts                   GET, POST /api/responses
│   ├── [id].ts                    GET, PATCH, DELETE /api/responses/:id
│   └── [id]/
│       └── word-timestamps.ts     GET /api/responses/:id/word-timestamps
│
├── narratives/
│   ├── index.ts                   GET /api/narratives
│   └── [id]/
│       └── responses.ts           GET /api/narratives/:id/responses
│
├── speakers/
│   ├── index.ts                   GET, POST /api/speakers
│   └── [id].ts                    GET /api/speakers/:id
│
├── graph/
│   └── load.ts                    GET /api/graph/load (composite endpoint)
│
├── docs/
│   └── index.ts                   GET /api/docs (Swagger UI)
│
└── [existing AI endpoints unchanged]
```

---

## Authentication

- **Read endpoints**: Public (no auth required)
- **Write endpoints**: Require Bearer token (Supabase JWT)
- **Admin endpoints**: Require authenticated user with admin role

---

## Error Format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Conversation not found",
    "details": { "id": "conv_123" }
  }
}
```

Error codes:
- `BAD_REQUEST` (400)
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `METHOD_NOT_ALLOWED` (405)
- `CONFLICT` (409)
- `INTERNAL_ERROR` (500)
- `DATABASE_ERROR` (500)
- `SERVICE_UNAVAILABLE` (503)

---

## Environment Variables

**Server-only (required for API):**
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

**Frontend (still needed for file uploads):**
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_RECORDINGS_BUCKET=Recordings
VITE_SUPABASE_CONVERSATIONS_BUCKET=Conversations
```

---

## Usage

### Development

```bash
# Run the development server
npm run dev

# Validate OpenAPI spec
npm run api:validate

# Generate TypeScript types from spec
npm run api:types
```

### API Documentation

Visit `/api/docs` when running the app to see the interactive Swagger UI documentation.

### Frontend Usage

```typescript
import { apiClient } from './services/apiClient';

// Get data
const anthologies = await apiClient.getList<ApiAnthology>('/anthologies');
const conversation = await apiClient.get<ApiConversation>('/conversations/123');

// Create/update data (requires auth)
const newResponse = await apiClient.post<ApiResponse>('/responses', { ... });
const updated = await apiClient.patch<ApiResponse>('/responses/123', { ... });
await apiClient.delete('/responses/123');
```

---

## Success Criteria ✅

- [x] All core data flows through API endpoints
- [x] Read operations migrated from frontend
- [x] OpenAPI documentation complete
- [x] TypeScript types shared between frontend/API
- [x] Error handling standardized
- [ ] Supabase SDK removed from frontend bundle (partial - still needed for file uploads)

---

*Implementation completed: January 30, 2025*
