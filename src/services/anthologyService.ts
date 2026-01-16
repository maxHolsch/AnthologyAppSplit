/**
 * Anthology Service
 * Handles top-level anthology operations
 */

import { supabase } from './supabaseClient';

export interface AnthologySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  created_at?: string;
}

export const AnthologyService = {
  async listPublic(): Promise<AnthologySummary[]> {
    // If credentials are missing, return a safe fallback so the homepage still works.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }

    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, created_at')
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching anthologies:', error);
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }

    const rows = (data || []) as AnthologySummary[];
    if (rows.length === 0) {
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }
    return rows;
  },

  async getBySlug(slug: string): Promise<AnthologySummary | null> {
    const { data, error } = await supabase
      .from('anthology_anthologies')
      .select('id, slug, title, description, created_at')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching anthology by slug:', error);
      return null;
    }

    return (data as AnthologySummary) || null;
  },
};
