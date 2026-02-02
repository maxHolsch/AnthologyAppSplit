/**
 * Anthology Service
 * Handles top-level anthology operations via REST API
 */

import { apiClient, ApiError } from './apiClient';
import type { ApiAnthology } from '../../shared/types/api.types';

export interface AnthologySummary {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  created_at?: string;
}

/**
 * Transform API response to legacy format
 */
function toAnthologySummary(api: ApiAnthology): AnthologySummary {
  return {
    id: api.id,
    slug: api.slug,
    title: api.title,
    description: api.description,
    created_at: api.createdAt,
  };
}

export const AnthologyService = {
  async listPublic(): Promise<AnthologySummary[]> {
    try {
      const response = await apiClient.getList<ApiAnthology>('/anthologies', {
        publicOnly: true,
        limit: 100, // Load up to 100 anthologies
      });

      const anthologies = response.data.map(toAnthologySummary);

      if (anthologies.length === 0) {
        return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
      }

      return anthologies;
    } catch (error) {
      console.warn('Error fetching anthologies:', error);
      return [{ id: 'default', slug: 'default', title: 'Default Anthology', description: null }];
    }
  },

  async getBySlug(slug: string): Promise<AnthologySummary | null> {
    try {
      const anthology = await apiClient.get<ApiAnthology>(`/anthologies/${slug}`);
      return toAnthologySummary(anthology);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') {
        return null;
      }
      console.warn('Error fetching anthology by slug:', error);
      return null;
    }
  },
};
