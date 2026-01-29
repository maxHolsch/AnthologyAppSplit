import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useRecordAndTranscribe } from '@hooks';
import { useAnthologyStore } from '@stores';
import { judgeQuestionPlacement } from '@/services/questionPlacement';
import { AdminService, GraphDataService } from '@/services';
import type { QuestionNode, ResponseNode, WordTimestamp } from '@types';
import styles from './AddYourVoiceModal.module.css';

type Stage = 'record' | 'review';

function inferConversationIdForQuestion(questionId: string, responses: Map<string, ResponseNode>, rawConversations: any) {
  for (const r of responses.values()) {
    if (r.responds_to === questionId && typeof r.conversation_id === 'string' && r.conversation_id.length > 0) {
      // Find the conversation's _db_id by matching conversation_id
      // r.conversation_id is the legacy_id or id of the conversation
      const matchingConv = rawConversations?.find(
        (c: any) => c._db_id === r.conversation_id || c.conversation_id === r.conversation_id
      );
      if (matchingConv?._db_id) {
        return matchingConv._db_id;
      }
      // Fallback to conversation_id if no match found (may be UUID already)
      return r.conversation_id;
    }
  }

  // Fallback to the UUID of the first conversation if available
  const conv0 = rawConversations?.[0];
  return conv0?._db_id || conv0?.conversation_id || '';
}

export interface AddYourVoiceModalProps {
  open: boolean;
  onClose: () => void;
  anthologySlug?: string;
}

export const AddYourVoiceModal = memo<AddYourVoiceModalProps>(({ open, onClose, anthologySlug }) => {
  const [stage, setStage] = useState<Stage>('record');
  const [name, setName] = useState('');
  const [transcript, setTranscript] = useState('');
  const [reason, setReason] = useState<string>('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [uploadedRecordingId, setUploadedRecordingId] = useState<string>('');
  const [recordingDurationMs, setRecordingDurationMs] = useState<number>(0);
  const [wordTimestamps, setWordTimestamps] = useState<WordTimestamp[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { recorder, audioPreviewUrl, uploadAndTranscribe } = useRecordAndTranscribe({
    fileNamePrefix: 'voice',
    speakerName: name.trim(),
  });

  const loadData = useAnthologyStore((s) => s.loadData);
  const selectResponse = useAnthologyStore((s) => s.selectResponse);
  const questionNodes = useAnthologyStore((s) => s.data.questionNodes);
  const responseNodes = useAnthologyStore((s) => s.data.responseNodes);
  const rawConversations = useAnthologyStore((s) => s.data.rawData?.conversations);

  const questionsArray = useMemo(() => {
    const arr = Array.from(questionNodes.values()) as QuestionNode[];
    // Keep stable ordering for dropdown.
    return arr.sort((a, b) => (a.question_text || '').localeCompare(b.question_text || ''));
  }, [questionNodes]);

  useEffect(() => {
    if (!open) {
      setStage('record');
      setName('');
      setTranscript('');
      setReason('');
      setSelectedQuestionId('');
      setUploadedRecordingId('');
      setRecordingDurationMs(0);
      setWordTimestamps([]);
      setIsWorking(false);
      setStatus('');
      setError(null);
      recorder.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const runTranscribeAndSuggest = useCallback(async () => {
    setError(null);
    setStatus('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!recorder.audioBlob) {
      setError('Please record audio first.');
      return;
    }
    if (questionsArray.length === 0) {
      setError('No question nodes are loaded yet.');
      return;
    }

    setIsWorking(true);
    try {
      setStatus('Uploading and transcribing…');
      const result = await uploadAndTranscribe();

      setUploadedRecordingId(result.recordingId);
      setRecordingDurationMs(result.recordingDurationMs);
      setTranscript(result.transcript);
      setWordTimestamps(result.wordTimestamps);

      setStatus('Asking the LLM to suggest the best question…');
      const placement = await judgeQuestionPlacement(
        result.transcript,
        questionsArray.map((q) => ({ id: q.id, text: q.question_text }))
      );

      setSelectedQuestionId(placement.bestQuestionId);
      setReason(placement.reason || '');

      setStage('review');
      setStatus('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transcribe/suggest');
      setStatus('');
    } finally {
      setIsWorking(false);
    }
  }, [name, recorder.audioBlob, uploadAndTranscribe, questionsArray]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setStatus('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name.');
      return;
    }
    if (!selectedQuestionId && selectedQuestionId !== 'none') {
      setError('Please choose a question node or select None.');
      return;
    }
    if (!transcript.trim()) {
      setError('Missing transcript. Please transcribe first.');
      return;
    }

    setIsWorking(true);
    try {
      if (!uploadedRecordingId || !recordingDurationMs) {
        throw new Error('Missing uploaded recording metadata. Please transcribe again.');
      }

      const conversationId = selectedQuestionId && selectedQuestionId !== 'none'
        ? inferConversationIdForQuestion(selectedQuestionId, responseNodes, rawConversations)
        : (rawConversations?.[0] as any)?._db_id || rawConversations?.[0]?.conversation_id;

      if (!conversationId) {
        throw new Error('Could not infer conversation for selected question.');
      }

      setStatus('Saving response…');
      const created = await AdminService.addResponseToQuestion({
        conversationId,
        questionId: selectedQuestionId === 'none' ? undefined : selectedQuestionId,
        respondentName: trimmedName,
        speakerText: transcript.trim(),
        recordingId: uploadedRecordingId,
        recordingDurationMs,
        wordTimestamps,
      });

      setStatus('Refreshing graph…');
      console.log('[AddYourVoiceModal] refreshing data using slug:', anthologySlug);
      const graph = await GraphDataService.loadAll({ anthologySlug });
      await loadData(graph);
      selectResponse(created.legacy_id || created.id);

      close();
    } catch (e) {
      console.error('[AddYourVoiceModal] submission failed:', e);
      if (e && typeof e === 'object' && 'details' in e) {
        console.error('[AddYourVoiceModal] Supabase error details:', (e as any).details);
      }
      setError(e instanceof Error ? e.message : 'Failed to submit');
      setStatus('');
    } finally {
      setIsWorking(false);
    }
  }, [name, selectedQuestionId, transcript, uploadedRecordingId, recordingDurationMs, wordTimestamps, responseNodes, rawConversations, loadData, selectResponse, close, anthologySlug]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>Add your voice</h3>
          <button className={styles.closeButton} onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          {stage === 'record' && (
            <>
              <div className={styles.row}>
                {recorder.state !== 'recording' ? (
                  <button className={styles.primaryButton} onClick={() => recorder.start()} disabled={isWorking}>
                    Start recording
                  </button>
                ) : (
                  <button className={styles.dangerButton} onClick={() => recorder.stop()} disabled={isWorking}>
                    Stop recording
                  </button>
                )}
                <button
                  className={styles.secondaryButton}
                  onClick={() => recorder.reset()}
                  disabled={isWorking || recorder.state === 'recording'}
                >
                  Reset
                </button>
              </div>

              {recorder.error && <div className={styles.error}>{recorder.error}</div>}
              {audioPreviewUrl && <audio controls src={audioPreviewUrl} style={{ width: '100%' }} />}

              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={isWorking}
              />

              <div className={styles.hint}>
                We’ll upload your recording, transcribe it with AssemblyAI, then suggest a question node to attach it to.
              </div>

              <div className={styles.row}>
                <button
                  className={styles.primaryButton}
                  onClick={runTranscribeAndSuggest}
                  disabled={isWorking || recorder.state === 'recording' || !recorder.audioBlob}
                >
                  Transcribe & suggest
                </button>
                <button className={styles.secondaryButton} onClick={close} disabled={isWorking}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {stage === 'review' && (
            <>
              <div>
                <div className={styles.label}>Transcript</div>
                <textarea className={styles.textarea} value={transcript} readOnly />
              </div>

              <div>
                <div className={styles.label}>Suggested question</div>
                <select
                  className={styles.select}
                  value={selectedQuestionId}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  disabled={isWorking}
                >
                  <option value="none">None (Freely on map)</option>
                  {questionsArray.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.question_text}
                    </option>
                  ))}
                </select>
                {reason && <div className={styles.hint}>{reason}</div>}
              </div>

              <div className={styles.row}>
                <button className={styles.secondaryButton} onClick={() => setStage('record')} disabled={isWorking}>
                  Back
                </button>
              </div>

              <div className={styles.row}>
                <button className={styles.primaryButton} onClick={handleSubmit} disabled={isWorking}>
                  Submit
                </button>
                <button className={styles.secondaryButton} onClick={close} disabled={isWorking}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {isWorking && status && <div className={styles.loading}>{status}</div>}
        </div>
      </div>
    </div>
  );
});

AddYourVoiceModal.displayName = 'AddYourVoiceModal';
