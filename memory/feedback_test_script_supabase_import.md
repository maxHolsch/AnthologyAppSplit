---
name: Test script Supabase import pattern
description: How to import Supabase in test scripts — do NOT import from api/_lib/supabase, initialize inline instead
type: feedback
---

Do NOT import `getSupabase` or `getConversationsBucket` from `../api/_lib/supabase` in test scripts.

**Why:** tsx fails with "does not provide an export named X" — likely due to the `Proxy`-based `supabase` export in that module conflicting with ESM static analysis.

**How to apply:** In any test script that needs Supabase, initialize the client inline using `@supabase/supabase-js` directly:

```typescript
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  return createClient(url, key, { db: { schema }, auth: { autoRefreshToken: false, persistSession: false } });
}

function getConversationsBucket(): string {
  const schema = process.env.SUPABASE_DB_SCHEMA || 'public';
  return schema !== 'public' ? 'Development_Conversations' : 'Conversations';
}
```
