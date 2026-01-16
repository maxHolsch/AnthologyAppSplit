import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ResponseNode, WordTimestamp } from '@types';
import { useAudioRecorder } from '@hooks';
import { transcribeAudioUrl } from '@/services/transcription';
import { AdminService, GraphDataService, RecordingService } from '@/services';
import { useAnthologyStore } from '@stores';
import styles from './RespondModal.module.css';

type Mode = 'choose' | 'record' | 'write';

async function getAudioDurationMs(blob: Blob): Promise<number> {
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

function pickFileName(mimeType: string | null) {
  const base = `response_${Date.now()}`;
  if (!mimeType) return `${base}.webm`;
  if (mimeType.includes('mp4')) return `${base}.m4a`;
  if (mimeType.includes('ogg')) return `${base}.ogg`;
  return `${base}.webm`;
}

export interface RespondModalProps {
  open: boolean;
  targetResponse: ResponseNode;
  onClose: () => void;
  anthologySlug?: string;
}

export const RespondModal = memo<RespondModalProps>(({ open, targetResponse, onClose, anthologySlug }) => {
  console.log('[RespondModal] rendered with slug:', anthologySlug);
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [typedText, setTypedText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useAnthologyStore((s) => s.loadData);
  const selectResponse = useAnthologyStore((s) => s.selectResponse);

  const recorder = useAudioRecorder();

  useEffect(() => {
    if (!open) {
      setMode('choose');
      setName('');
      setTypedText('');
      setIsSubmitting(false);
      setError(null);
      recorder.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const audioPreviewUrl = useMemo(() => {
    if (!recorder.audioBlob) return null;
    return URL.createObjectURL(recorder.audioBlob);
  }, [recorder.audioBlob]);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const conversationId = targetResponse.conversation_id;
      const parentResponseId = targetResponse.id;

      if (mode === 'record') {
        if (!recorder.audioBlob) {
          throw new Error('No recording captured.');
        }

        const durationMs = await getAudioDurationMs(recorder.audioBlob);
        const file = new File(
          [recorder.audioBlob],
          pickFileName(recorder.mimeType),
          { type: recorder.audioBlob.type || recorder.mimeType || 'audio/webm' }
        );

        // 1) Upload recording so we get a public URL for AssemblyAI
        const uploaded = await RecordingService.upload(file, durationMs);
        if (!uploaded) {
          throw new Error('Failed to upload recording to Supabase.');
        }

        // 2) Transcribe
        const transcript = await transcribeAudioUrl(uploaded.file_path);
        const speakerText = transcript.text || '';

        const wordTimestamps: WordTimestamp[] = Array.isArray(transcript.words)
          ? transcript.words
            .filter((w) => typeof w?.text === 'string' && typeof w?.start === 'number' && typeof w?.end === 'number')
            .map((w) => ({
              text: w.text,
              start: w.start,
              end: w.end,
              confidence: typeof w.confidence === 'number' ? w.confidence : undefined,
              speaker: trimmedName,
            }))
          : [];

        // 3) Insert response (responds-to-response)
        const created = await AdminService.addResponseToResponse({
          conversationId,
          parentResponseId,
          respondentName: trimmedName,
          speakerText,
          recordingId: uploaded.id,
          recordingDurationMs: durationMs,
          wordTimestamps,
        });

        // 4) Reload graph + select the newly-created response
        const graph = await GraphDataService.loadAll({ anthologySlug });
        await loadData(graph);
        selectResponse(created.legacy_id || created.id);

        close();
        return;
      }

      // mode === 'write'
      const text = typedText.trim();
      if (!text) {
        throw new Error('Please write a response.');
      }

      const created = await AdminService.addResponseToResponse({
        conversationId,
        parentResponseId,
        respondentName: trimmedName,
        speakerText: text,
      });

      const graph = await GraphDataService.loadAll({ anthologySlug });
      await loadData(graph);
      selectResponse(created.legacy_id || created.id);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit response');
    } finally {
      setIsSubmitting(false);
    }
  }, [name, typedText, mode, recorder.audioBlob, recorder.mimeType, targetResponse, loadData, selectResponse, close]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>Respond to {targetResponse.speaker_name}</h3>
          <button className={styles.closeButton} onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {mode === 'choose' && (
            <div className={styles.row}>
              <button
                className={styles.primaryButton}
                onClick={() => setMode('record')}
              >
                Record your response
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => setMode('write')}
              >
                Write instead
              </button>
            </div>
          )}

          {mode === 'record' && (
            <>
              <div className={styles.row}>
                {recorder.state !== 'recording' ? (
                  <button
                    className={styles.primaryButton}
                    onClick={() => recorder.start()}
                    disabled={isSubmitting}
                  >
                    Start recording
                  </button>
                ) : (
                  <button
                    className={styles.dangerButton}
                    onClick={() => recorder.stop()}
                    disabled={isSubmitting}
                  >
                    Stop recording
                  </button>
                )}

                <button
                  className={styles.secondaryButton}
                  onClick={() => {
                    recorder.reset();
                    setMode('choose');
                  }}
                  disabled={isSubmitting}
                >
                  Back
                </button>
              </div>

              {recorder.error && <div className={styles.error}>{recorder.error}</div>}

              {audioPreviewUrl && (
                <audio controls src={audioPreviewUrl} style={{ width: '100%' }} />
              )}

              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isSubmitting}
              />
              <div className={styles.hint}>We’ll transcribe your recording with AssemblyAI and post it as a new node.</div>
            </>
          )}

          {mode === 'write' && (
            <>
              <textarea
                className={styles.textarea}
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Write your response…"
                disabled={isSubmitting}
              />
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isSubmitting}
              />
              <div className={styles.row}>
                <button
                  className={styles.secondaryButton}
                  onClick={() => setMode('choose')}
                  disabled={isSubmitting}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {isSubmitting && <div className={styles.loading}>Submitting…</div>}

          {mode !== 'choose' && (
            <div className={styles.row}>
              <button
                className={styles.primaryButton}
                onClick={handleSubmit}
                disabled={isSubmitting || (mode === 'record' && recorder.state === 'recording')}
              >
                Submit
              </button>
              <button className={styles.secondaryButton} onClick={close} disabled={isSubmitting}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

RespondModal.displayName = 'RespondModal';
