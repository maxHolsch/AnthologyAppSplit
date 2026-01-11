# Hearst Anthology Migration Script

This script migrates your existing Hearst Anthology to match the manually edited transcript structure with themes and narratives.

## What it does

1. **Reads** the transcript JSON from `/Users/omgokhale/Downloads/transcript_analysis (1).json`
2. **Matches** existing responses to new excerpts using text similarity
3. **Updates** existing responses with theme/narrative metadata
4. **Splits** responses where one original response maps to multiple excerpts
5. **Creates** new responses for excerpts that don't match existing ones
6. **Generates** embeddings for new/split responses using OpenAI

## How to run

```bash
cd anthology-app
npm run migrate:hearst
```

## What the script will do:

### Step 1: Analysis
- Finds your Hearst Anthology in Supabase
- Loads existing responses
- Matches excerpts to existing responses using text similarity
- Shows you a migration plan:
  - ✏️ **Update existing**: Responses that match well and will be updated with new metadata
  - ✂️ **Split existing**: Responses that will be split into multiple excerpts
  - ➕ **Create new**: Excerpts that don't match existing responses

### Step 2: Confirmation
- Asks you to confirm before making changes
- Type `yes` to proceed or `no` to cancel

### Step 3: Execution
- Updates/creates responses in Supabase
- Generates embeddings for new responses (requires OpenAI API key)
- Shows progress for each excerpt

## Metadata Added

Each response will get metadata with:
- `theme_ids`: Array of theme IDs (e.g., ["T1", "T12"])
- `narrative_ids`: Array of narrative IDs (e.g., ["N1"])
- `themes`: Full theme objects with names
- `narratives`: Full narrative objects with names
- `page`: Page number from transcript

## Example Output

```
🚀 Starting Hearst Anthology Migration...

📖 Reading transcript from: /Users/omgokhale/Downloads/transcript_analysis (1).json
   Found 73 excerpts
   Found 16 themes
   Found 9 narratives

🔍 Looking for Hearst Anthology...
   Found: Hearst Anthology (abc123...)

📥 Fetching existing responses...
   Found 45 existing responses

🗺️  Building question mapping...
   Mapped 8 questions

🔄 Creating migration plan...

Migration Plan:
   ✏️  Update existing: 30
   ✂️  Split existing: 5
   ➕ Create new: 38

Proceed with migration? (yes/no): yes

🔨 Executing migration...

✅ Updated E1 (aayushi)
✅ Created E2 (aayushi)
   🔢 Generated embedding for E2
...

✨ Migration complete!
   ✅ Success: 73
   ❌ Errors: 0
```

## Requirements

- `.env` file with:
  - `VITE_SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
  - `OPENAI_API_KEY` (optional, but needed for embedding generation)

## Notes

- The script uses text similarity (Jaccard similarity) to match excerpts to existing responses
- Similarity threshold is 0.3 (30% word overlap)
- Rate limited to avoid hitting OpenAI API limits (100ms between requests)
- Safe to run multiple times - it's idempotent (won't create duplicates)

## Troubleshooting

**"Missing Supabase credentials"**
- Make sure your `.env` file exists and has the required variables

**"Could not find Hearst Anthology"**
- Check that your anthology title contains "hearst" (case-insensitive)

**"OpenAI API error"**
- Check your OpenAI API key
- You can skip embedding generation if needed (responses will have null embeddings)

## Rollback

If you need to rollback:
1. Go to Supabase Dashboard
2. Table Editor → anthology_responses
3. Filter by anthology_id
4. Delete responses created by the migration (check created_at timestamp)
