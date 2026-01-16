/**
 * useRecordAndTranscribe Hook
 * Consolidates recording + transcription logic used across multiple modals
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useAudioRecorder } from './useAudioRecorder';
import { transcribeAudioUrl } from '@/services/transcription';
import { RecordingService } from '@/services';
import type { WordTimestamp } from '@/types/data.types';

/**
 * Get audio duration in milliseconds from a Blob
 */
export async function getAudioDurationMs(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob);
  try {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('Failed to load audio metadata'));
    });
    const durationSec = Number.isFinite(audio.duration) ? audio.duration : 0;
    return Math.max(0, Math.round(durationSec * 1000));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Generate a filename based on mime type
 */
export function pickFileName(mimeType: string | null, prefix: string = 'recording'): string {
  const base = `${prefix}_${Date.now()}`;
  if (!mimeType) return `${base}.webm`;
  if (mimeType.includes('mp4')) return `${base}.m4a`;
  if (mimeType.includes('ogg')) return `${base}.ogg`;
  return `${base}.webm`;
}

export interface RecordingResult {
  recordingId: string;
  recordingDurationMs: number;
  transcript: string;
  wordTimestamps: WordTimestamp[];
}

export interface UseRecordAndTranscribeOptions {
  fileNamePrefix?: string;
  speakerName?: string;
}

/**
 * Hook that combines recording and transcription workflows
 */
export function useRecordAndTranscribe(options: UseRecordAndTranscribeOptions = {}) {
  const { fileNamePrefix = 'recording', speakerName } = options;
  const recorder = useAudioRecorder();

  // Create audio preview URL from blob
  const audioPreviewUrl = useMemo(() => {
    if (!recorder.audioBlob) return null;
    return URL.createObjectURL(recorder.audioBlob);
  }, [recorder.audioBlob]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  /**
   * Upload recording and transcribe it
   * Returns recording ID, duration, transcript text, and word timestamps
   */
  const uploadAndTranscribe = useCallback(async (): Promise<RecordingResult> => {
    if (!recorder.audioBlob) {
      throw new Error('No recording available. Please record audio first.');
    }

    // 1. Get audio duration
    const durationMs = await getAudioDurationMs(recorder.audioBlob);

    // 2. Create file from blob
    const file = new File(
      [recorder.audioBlob],
      pickFileName(recorder.mimeType, fileNamePrefix),
      { type: recorder.audioBlob.type || recorder.mimeType || 'audio/webm' }
    );

    // 3. Upload to Supabase storage
    const uploaded = await RecordingService.upload(file, durationMs);
    if (!uploaded) {
      throw new Error('Failed to upload recording to storage.');
    }

    // 4. Transcribe with AssemblyAI
    const transcription = await transcribeAudioUrl(uploaded.file_path);
    const text = (transcription.text || '').trim();
    if (!text) {
      throw new Error('Transcription returned empty text.');
    }

    // 5. Parse word timestamps
    const words = Array.isArray(transcription.words) ? transcription.words : [];
    const wordTimestamps: WordTimestamp[] = words
      .filter((w) => typeof w?.text === 'string' && typeof w?.start === 'number' && typeof w?.end === 'number')
      .map((w) => ({
        text: w.text,
        start: w.start,
        end: w.end,
        confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
        speaker: speakerName || '',
      }));

    return {
      recordingId: uploaded.id,
      recordingDurationMs: durationMs,
      transcript: text,
      wordTimestamps,
    };
  }, [recorder.audioBlob, recorder.mimeType, fileNamePrefix, speakerName]);

  return {
    // Recorder state and controls
    recorder,
    audioPreviewUrl,

    // Main workflow function
    uploadAndTranscribe,

    // Utility functions (exported for advanced use cases)
    getAudioDurationMs,
    pickFileName,
  };
}
