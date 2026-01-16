/**
 * Conversation Upload Service
 * Handles file uploads for the Create Anthology flow
 */

import { supabase, CONVERSATIONS_BUCKET } from './supabaseClient';

export const ConversationUploadService = {
  async uploadConversations({
    anthologyFolderSlug,
    files,
  }: {
    anthologyFolderSlug: string;
    files: File[];
  }): Promise<Array<{ fileName: string; ok: boolean; path?: string; error?: string }>> {
    const safeSlug = anthologyFolderSlug || 'untitled';

    const results: Array<{ fileName: string; ok: boolean; path?: string; error?: string }> = [];

    for (const file of files) {
      const fileName = file.name;
      const objectPath = `upload_conversations/${safeSlug}/${Date.now()}_${fileName}`;

      const { error } = await supabase.storage
        .from(CONVERSATIONS_BUCKET)
        .upload(objectPath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

      if (error) {
        results.push({ fileName, ok: false, error: error.message });
      } else {
        results.push({ fileName, ok: true, path: objectPath });
      }
    }

    return results;
  },
};
