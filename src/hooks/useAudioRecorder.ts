import { useCallback, useRef, useState } from 'react';

type RecorderState = 'idle' | 'recording' | 'stopped' | 'error';

export interface UseAudioRecorderResult {
  state: RecorderState;
  error: string | null;
  audioBlob: Blob | null;
  mimeType: string | null;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    // Safari (often)
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    // Chrome/Firefox (often)
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/**
 * Minimal MediaRecorder wrapper for recording a single audio blob.
 */
export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const start = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const chosen = pickSupportedMimeType();
      setMimeType(chosen);
      const recorder = chosen
        ? new MediaRecorder(stream, { mimeType: chosen })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onerror = () => {
        setState('error');
        setError('Recording failed.');
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        setAudioBlob(blob);
        setState('stopped');
      };

      recorder.start();
      setState('recording');
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Microphone permission denied.');
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } finally {
      // Always stop tracks so mic indicator turns off.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setAudioBlob(null);
    setMimeType(null);
    chunksRef.current = [];

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  return { state, error, audioBlob, mimeType, start, stop, reset };
}

