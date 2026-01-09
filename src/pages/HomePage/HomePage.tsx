import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './HomePage.module.css';
import { AnthologyService, type AnthologySummary } from '@/services/supabase';
import { CreateAnthologyModal } from '@/components/CreateAnthology/CreateAnthologyModal';

export function HomePage() {
  const [anthologies, setAnthologies] = useState<AnthologySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  const sorted = useMemo(() => {
    return [...anthologies].sort((a, b) => a.title.localeCompare(b.title));
  }, [anthologies]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const list = await AnthologyService.listPublic();
        if (!cancelled) setAnthologies(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load anthologies');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onCreateClick = () => {
    const pw = window.prompt('Password required to create an anthology');
    if (pw === 'jovial-shellfish') {
      setCreateOpen(true);
      return;
    }
    window.alert('Incorrect password');
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Anthology</h1>
          <p className={styles.subtitle}>Browse anthologies or create a new one.</p>
        </div>
        <button className={styles.createButton} onClick={onCreateClick}>
          Create anthology
        </button>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Anthologies</h2>

        {isLoading ? (
          <div className={styles.status}>Loading…</div>
        ) : loadError ? (
          <div className={styles.statusError}>{loadError}</div>
        ) : sorted.length === 0 ? (
          <div className={styles.status}>No anthologies found.</div>
        ) : (
          <div className={styles.grid}>
            {sorted.map((a) => (
              <Link key={a.slug} to={`/anthologies/${a.slug}`} className={styles.card}>
                <div className={styles.cardTitle}>{a.title}</div>
                <div className={styles.cardSlug}>/{a.slug}</div>
                {a.description ? <div className={styles.cardDesc}>{a.description}</div> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <CreateAnthologyModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
