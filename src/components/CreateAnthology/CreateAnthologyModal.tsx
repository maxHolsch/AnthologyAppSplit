import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './CreateAnthologyModal.module.css';
import { slugify } from '@/utils/slugify';
import { ConversationUploadService } from '@/services/supabase';

type Props = {
  open: boolean;
  onClose: () => void;
};

type UploadRow = {
  file: File;
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  message?: string;
};

type SensemakingProgress = {
  overall?: { done: number; total: number };
  files?: Record<string, { step: string; message?: string; updated_at?: string }>;
};

type SensemakingStatus = {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'error';
  anthologySlug: string;
  anthologyId: string;
  progress: SensemakingProgress;
  error?: string;
};

export function CreateAnthologyModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const stopPollingRef = useRef<null | (() => void)>(null);
  const [anthologyName, setAnthologyName] = useState('');
  const [mainQuestions, setMainQuestions] = useState('');
  const [mainNarratives, setMainNarratives] = useState('');
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [includePreviousUploads, setIncludePreviousUploads] = useState(false);
  const [sensemaking, setSensemaking] = useState<SensemakingStatus | null>(null);
  const [isSensemaking, setIsSensemaking] = useState(false);

  const anthologySlug = useMemo(() => slugify(anthologyName), [anthologyName]);

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    const next: UploadRow[] = Array.from(files).map((f) => ({ file: f, status: 'idle' }));
    setUploads(next);
  };

  const onUpload = async () => {
    if (!anthologySlug) {
      window.alert('Please enter an anthology name first.');
      return;
    }
    if (uploads.length === 0) {
      window.alert('Please choose at least one conversation file to upload.');
      return;
    }

    setIsUploading(true);
    setUploads((rows) => rows.map((r) => ({ ...r, status: 'uploading', message: undefined })));

    try {
      const results = await ConversationUploadService.uploadConversations({
        anthologyFolderSlug: anthologySlug,
        files: uploads.map((u) => u.file),
      });

      setUploads((rows) =>
        rows.map((r) => {
          const res = results.find((x) => x.fileName === r.file.name);
          if (!res) return { ...r, status: 'error', message: 'Unknown upload result' };
          return res.ok
            ? { ...r, status: 'uploaded', message: res.path }
            : { ...r, status: 'error', message: res.error || 'Upload failed' };
        })
      );
    } finally {
      setIsUploading(false);
    }
  };

  const parseTemplateQuestions = (raw: string): string[] => {
    // Split by newlines; keep non-empty lines.
    // Users often paste bullets; strip leading '-', '*', '•'.
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[-*•]\s+/, '').trim())
      .filter((l) => l.length > 0);
  };

  const parseTemplateNarratives = (raw: string): string[] => {
    // Split by newlines; keep non-empty lines.
    // Users often paste bullets; strip leading '-', '*', '•'.
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[-*•]\s+/, '').trim())
      .filter((l) => l.length > 0);
  };

  const startPolling = (jobId: string) => {
    let cancelled = false;
    let failures = 0;
    let timer: number | null = null;

    const schedule = (ms: number) => {
      if (cancelled) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(tick, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const controller = new AbortController();
        // Tick can take longer when a transcript completes (LLM + DB writes). Keep a generous timeout.
        const timeout = window.setTimeout(() => controller.abort(), 120000);

        const res = await fetch('/api/sensemaking/tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, timeBudgetMs: 15000 }),
          signal: controller.signal,
        });

        window.clearTimeout(timeout);

        if (!res.ok) {
          // Try to decode the server’s JSON error envelope; fall back to raw text.
          const raw = await res.text().catch(() => '');
          try {
            const parsed = JSON.parse(raw) as any;
            const msg = typeof parsed?.error === 'string' ? parsed.error : raw;
            throw new Error(msg || `Sensemaking tick failed (${res.status})`);
          } catch {
            throw new Error(raw || `Sensemaking tick failed (${res.status})`);
          }
        }

        const status = (await res.json()) as SensemakingStatus;
        if (!cancelled) setSensemaking(status);

        failures = 0;

        if (status.status === 'done') {
          setIsSensemaking(false);
          onClose();
          navigate(`/anthologies/${status.anthologySlug}`);
          return;
        }

        if (status.status === 'error') {
          setIsSensemaking(false);
          return;
        }
      } catch (e) {
        failures += 1;
        const msg = e instanceof Error ? e.message : 'Sensemaking tick failed';
        // eslint-disable-next-line no-console
        console.warn('[sensemaking] tick error', { failures, msg });

        // Keep polling even if a single tick fails (transient network/server errors).
        if (!cancelled) {
          setSensemaking((prev) =>
            prev
              ? {
                  ...prev,
                  error: `Tick failed (${failures}): ${msg}`,
                }
              : null
          );
        }
      }

      // Continue polling (exponential backoff on failures)
      const delay = Math.min(30_000, 2000 * Math.pow(2, Math.max(0, failures - 1)));
      schedule(delay);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  };

  useEffect(() => {
    // If modal closes/unmounts, stop background polling.
    if (!open) {
      stopPollingRef.current?.();
      stopPollingRef.current = null;
    }
    return () => {
      stopPollingRef.current?.();
      stopPollingRef.current = null;
    };
  }, [open]);

  // IMPORTANT: keep this AFTER all hooks so we don't change hook order between renders.
  if (!open) return null;

  const onRunSensemaking = async () => {
    if (!anthologySlug) {
      window.alert('Please enter an anthology name first.');
      return;
    }

    const uploadedPaths = uploads
      .filter((u) => u.status === 'uploaded' && typeof u.message === 'string' && u.message.length > 0)
      .map((u) => u.message as string);

    if (uploadedPaths.length === 0) {
      window.alert('Please upload at least one conversation file first.');
      return;
    }

    const templateQuestions = parseTemplateQuestions(mainQuestions);
    if (templateQuestions.length === 0) {
      window.alert('Please enter at least one main question.');
      return;
    }

    const templateNarratives = parseTemplateNarratives(mainNarratives);

    console.log('[CreateAnthology] Starting sensemaking with:', {
      anthologySlug,
      anthologyName,
      templateQuestionsCount: templateQuestions.length,
      templateQuestions,
      templateNarrativesCount: templateNarratives.length,
      templateNarratives,
      uploadedPathsCount: uploadedPaths.length,
    });

    setIsSensemaking(true);
    setSensemaking(null);

    try {
      const payload = {
        anthologySlug,
        anthologyTitle: anthologyName,
        templateQuestions,
        templateNarratives,
        uploadedFilePaths: uploadedPaths,
        includePreviousUploads,
      };
      console.log('[CreateAnthology] Sending payload:', payload);

      const res = await fetch('/api/sensemaking/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Sensemaking start failed (${res.status})`);
      }

      const started = (await res.json()) as { jobId: string; anthologySlug: string; anthologyId: string };
      setSensemaking({
        jobId: started.jobId,
        status: 'queued',
        anthologySlug: started.anthologySlug,
        anthologyId: started.anthologyId,
        progress: {},
      });

      stopPollingRef.current?.();
      stopPollingRef.current = startPolling(started.jobId);
    } catch (e) {
      setIsSensemaking(false);
      window.alert(e instanceof Error ? e.message : 'Failed to start sensemaking');
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>Create anthology</div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>
            Anthology name
            <input
              className={styles.input}
              value={anthologyName}
              onChange={(e) => setAnthologyName(e.target.value)}
              placeholder="e.g. My Sensemaking Conversation"
            />
            <div className={styles.help}>
              Upload folder: <code className={styles.code}>upload_conversations/{anthologySlug || '…'}/</code>
            </div>
          </label>

          <label className={styles.label}>
            Main questions this conversation revolves around
            <textarea
              className={styles.textarea}
              value={mainQuestions}
              onChange={(e) => setMainQuestions(e.target.value)}
              placeholder="Paste the key questions here…"
              rows={5}
            />
          </label>

          <label className={styles.label}>
            Main narratives this conversation revolves around
            <textarea
              className={styles.textarea}
              value={mainNarratives}
              onChange={(e) => setMainNarratives(e.target.value)}
              placeholder="Paste the key narratives here… (optional)"
              rows={5}
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={includePreviousUploads}
              onChange={(e) => setIncludePreviousUploads(e.target.checked)}
              disabled={isSensemaking}
            />
            <span>Include previous uploads in folder</span>
          </label>

          <div className={styles.uploadRow}>
            <div className={styles.labelTitle}>Upload conversations</div>
            <input
              className={styles.file}
              type="file"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <button className={styles.secondaryButton} onClick={onUpload} disabled={isUploading}>
              {isUploading ? 'Uploading…' : 'Upload selected files'}
            </button>
          </div>

          {uploads.length > 0 ? (
            <div className={styles.uploadList}>
              {uploads.map((u) => (
                <div key={u.file.name} className={styles.uploadItem}>
                  <div className={styles.uploadName}>{u.file.name}</div>
                  <div className={styles.uploadStatus} data-status={u.status}>
                    {u.status}
                    {u.message ? <span className={styles.uploadMsg}> — {u.message}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {sensemaking ? (
            <div className={styles.sensemakingBox}>
              <div className={styles.sensemakingTitle}>Sensemaking progress</div>
              <div className={styles.sensemakingMeta}>
                Status: <code className={styles.code}>{sensemaking.status}</code>
                {sensemaking.progress?.overall ? (
                  <>
                    {' '}
                    — {sensemaking.progress.overall.done}/{sensemaking.progress.overall.total} recordings done
                  </>
                ) : null}
              </div>

              {sensemaking.error ? <div className={styles.statusError}>{sensemaking.error}</div> : null}

              {sensemaking.progress?.files ? (
                <div className={styles.sensemakingList}>
                  {Object.entries(sensemaking.progress.files).map(([filePath, s]) => (
                    <div key={filePath} className={styles.sensemakingItem}>
                      <div className={styles.sensemakingFile}>{filePath}</div>
                      <div className={styles.sensemakingStep}>
                        <code className={styles.code}>{s.step}</code>
                        {s.message ? <span className={styles.sensemakingMsg}> — {s.message}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.primaryButton} onClick={onRunSensemaking} disabled={isSensemaking}>
            {isSensemaking ? 'Sensemaking…' : 'Run sensemaking'}
          </button>
        </div>
      </div>
    </div>
  );
}
