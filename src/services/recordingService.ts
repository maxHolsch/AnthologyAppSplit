/**
 * Recording Service
 * Handles recording uploads and retrieval
 */

import { supabase, RECORDINGS_BUCKET, type DbRecording } from './supabaseClient';

export const RecordingService = {
  /**
   * Get recording by ID
   */
  async getById(id: string): Promise<DbRecording | null> {
    const { data, error } = await supabase
      .from('anthology_recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching recording:', error);
      return null;
    }

    return data;
  },

  /**
   * Get all recordings
   */
  async getAll(): Promise<DbRecording[]> {
    const { data, error } = await supabase
      .from('anthology_recordings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching recordings:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Upload new recording
   */
  async upload(file: File, durationMs?: number): Promise<DbRecording | null> {
    // Upload to Supabase Storage
    const fileName = `${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(RECORDINGS_BUCKET)
      .upload(fileName, file, {
        contentType: file.type || undefined,
      });

    if (uploadError) {
      if (typeof uploadError.message === 'string' && uploadError.message.includes('row-level security')) {
        console.error(
          `Supabase Storage RLS blocked upload. Ensure you have an INSERT policy on storage.objects for bucket "${RECORDINGS_BUCKET}".`
        );
      }
      console.error('Error uploading recording:', uploadError);
      return null;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(RECORDINGS_BUCKET)
      .getPublicUrl(fileName);

    // Create database entry
    const { data, error } = await supabase
      .from('anthology_recordings')
      .insert({
        file_path: publicUrlData.publicUrl,
        file_name: fileName,
        file_size_bytes: file.size,
        mime_type: file.type,
        duration_ms: durationMs ?? 0
      })
      .select()
      .single();

    if (error) {
      // With RLS enabled, anon key inserts will fail unless you add an INSERT policy.
      if ((error as any)?.code === '42501' || (error as any)?.message?.includes('row-level security')) {
        console.error(
          'Database RLS blocked insert into anthology_recordings. Add an INSERT policy for the anon/public role if you want browser uploads to create DB rows.'
        );
      }
      console.error('Error creating recording entry:', error);
      return null;
    }

    return data;
  }
};
