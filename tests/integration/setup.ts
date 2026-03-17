/**
 * Vitest setup file for integration tests.
 * Loads .env BEFORE any test modules are imported,
 * so that api/_lib/supabase.ts picks up real credentials.
 */
import dotenv from 'dotenv';
dotenv.config();
