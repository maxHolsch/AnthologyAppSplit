/**
 * API Authentication
 * JWT-based authentication for protected API endpoints
 */

import type { VercelRequest } from '@vercel/node';
import { createClient, User } from '@supabase/supabase-js';
import { ApiException, ErrorCodes } from './errors';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Authentication result
 */
export interface AuthResult {
  user: User;
  isAdmin: boolean;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [type, token] = authHeader.split(' ');
  if (type?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
}

/**
 * Verify JWT token and get user
 * Returns null if no token provided (for optional auth)
 * Throws ApiException if token is invalid
 */
export async function verifyToken(req: VercelRequest): Promise<AuthResult | null> {
  const token = extractBearerToken(req);

  if (!token) {
    return null;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new ApiException(
      ErrorCodes.SERVICE_UNAVAILABLE,
      'Authentication service not configured'
    );
  }

  // Create a client with the user's JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApiException(
      ErrorCodes.UNAUTHORIZED,
      'Invalid or expired token'
    );
  }

  // Check if user has admin role (stored in user metadata or a separate table)
  const isAdmin = user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin';

  return { user, isAdmin };
}

/**
 * Require authentication for an endpoint
 * Throws ApiException if not authenticated
 */
export async function requireAuth(req: VercelRequest): Promise<AuthResult> {
  const auth = await verifyToken(req);

  if (!auth) {
    throw new ApiException(
      ErrorCodes.UNAUTHORIZED,
      'Authentication required'
    );
  }

  return auth;
}

/**
 * Require admin role for an endpoint
 * Throws ApiException if not authenticated or not admin
 */
export async function requireAdmin(req: VercelRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);

  if (!auth.isAdmin) {
    throw new ApiException(
      ErrorCodes.FORBIDDEN,
      'Admin access required'
    );
  }

  return auth;
}

/**
 * Optional authentication - returns null if not authenticated
 * Does not throw for missing auth, only for invalid tokens
 */
export async function optionalAuth(req: VercelRequest): Promise<AuthResult | null> {
  try {
    return await verifyToken(req);
  } catch (error) {
    // If token was provided but invalid, still throw
    if (error instanceof ApiException && error.code === ErrorCodes.UNAUTHORIZED) {
      throw error;
    }
    return null;
  }
}
