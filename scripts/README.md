# API Test Scripts

Collection of test scripts for testing Anthology API endpoints.

## Prepare Turns Test

Tests the `/api/sensemaking/prepare-turns` API flow.

### Prerequisites

1. Start the local API server:
   ```bash
   npm run dev:api
   ```

2. Have a recording that has been transcribed (status = 'completed')

### Usage

```bash
npm run test:prepare-turns <recordingId>
```

Or with tsx directly:
```bash
tsx scripts/test-prepare-turns.ts <recordingId>
```

### Example

```bash
npm run test:prepare-turns 123e4567-e89b-12d3-a456-426614174000
```

### What it does

1. **POST /api/sensemaking/prepare-turns** - Starts the job
2. **POST /api/sensemaking/prepare-turns/tick** - Executes the work
3. **GET /api/sensemaking/prepare-turns/status** - Checks final status

### Output

The script will show:
- Job start status
- Processing results (turn count, reduction ratio)
- Final status with timestamps
- Next steps in the sensemaking pipeline

### Environment Variables

- `API_BASE` - Base URL for API (default: `http://localhost:3001`)

Example:
```bash
API_BASE=https://your-app.vercel.app npm run test:prepare-turns <recordingId>
```

## Finding a Recording ID

You can find recording IDs by:

1. Query the database:
   ```sql
   SELECT id, file_name, metadata->>'transcription_status' as status
   FROM anthology_recordings
   WHERE metadata->>'transcription_status' = 'completed'
   LIMIT 10;
   ```

2. Use the recordings API:
   ```bash
   curl http://localhost:3001/api/recordings | jq '.data[] | {id, fileName}'
   ```
