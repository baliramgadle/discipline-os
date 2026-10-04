import { useCallback, useEffect, useState } from 'react';

import { fetchArchivedRecords, restoreArchivedRecord, type ArchivedRecord } from '../services/api';

type Props = { token: string };

const labels: Record<ArchivedRecord['kind'], string> = {
  task: 'Task',
  routine: 'Routine',
  project: 'Project',
  goal: 'Goal',
  'financial-account': 'Financial account',
  'financial-goal': 'Financial goal',
  budget: 'Budget',
  'study-session': 'Study session',
  'wellness-entry': 'Wellness entry',
};

export function ArchiveScreen({ token }: Props) {
  const [records, setRecords] = useState<ArchivedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setRecords(await fetchArchivedRecords(token));
  }, [token]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load archived items.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  const restore = async (record: ArchivedRecord) => {
    setRestoring(record.id);
    setError('');
    try {
      await restoreArchivedRecord(token, record);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not restore this item.');
    } finally {
      setRestoring('');
    }
  };

  return (
    <section className="screen-grid">
      <article className="panel">
        <div className="panel-header">
          <div><p className="eyebrow accent">Recoverable records</p><h3>Archive</h3></div>
          <span className="pill neutral">{records.length} items</span>
        </div>
        <p className="muted">Archived tasks, routines, projects, goals, accounts, and budgets stay here until you restore them.</p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {loading ? <p className="empty-state">Loading archived items…</p> : records.length ? (
          <div className="module-entry-list">
            {records.map((record) => (
              <article className="module-entry" key={`${record.kind}-${record.id}`}>
                <div className="goal-topline">
                  <strong>{record.title}</strong>
                  <button type="button" className="inline-button" disabled={Boolean(restoring)} onClick={() => void restore(record)}>
                    {restoring === record.id ? 'Restoring…' : 'Restore'}
                  </button>
                </div>
                <small>{labels[record.kind]}{record.detail ? ` · ${record.detail}` : ''}</small>
                {record.archivedAt && <small>Archived {new Date(record.archivedAt).toLocaleString()}</small>}
              </article>
            ))}
          </div>
        ) : <p className="empty-state">Nothing is archived right now.</p>}
      </article>
    </section>
  );
}
