import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  createStudySession,
  createWellnessEntry,
  archiveStudySession,
  archiveWellnessEntry,
  fetchStudySessions,
  fetchStudySummary,
  fetchTodayWellness,
  fetchWellnessSummary,
  updateStudySession,
  updateWellnessEntry,
} from '../services/api';
import type { Project, StudySession, WellnessEntry, WellnessKind, WellnessSummary } from '../types/auth';

type Props = {
  mode: 'study' | 'wellness';
  accessToken: string;
  projects: Project[];
};

const wellnessOptions: Array<{ value: WellnessKind; label: string }> = [
  { value: 'MEAL', label: 'Meal' },
  { value: 'WATER', label: 'Water' },
  { value: 'WORKOUT', label: 'Workout' },
  { value: 'SLEEP', label: 'Sleep' },
  { value: 'HABIT', label: 'Wellness habit' },
];

const kindLabel = (kind: WellnessKind) =>
  wellnessOptions.find((option) => option.value === kind)?.label ?? kind;

export function StudyWellnessScreen({ mode, accessToken, projects }: Props) {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [studySummary, setStudySummary] = useState({
    totalMinutes: 0,
    sessionCount: 0,
    studyDays: 0,
    minutesThisWeek: 0,
  });
  const [wellnessEntries, setWellnessEntries] = useState<WellnessEntry[]>([]);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingWellnessId, setEditingWellnessId] = useState<string | null>(null);
  const [wellnessSummary, setWellnessSummary] = useState<WellnessSummary>({
    last30Days: [],
    recentDays: [],
  });
  const [sessionForm, setSessionForm] = useState({
    subject: '',
    topic: '',
    durationMinutes: '',
    notes: '',
    projectId: '',
  });
  const [wellnessForm, setWellnessForm] = useState({
    kind: 'HABIT' as WellnessKind,
    label: '',
    quantity: '',
    unit: '',
    notes: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (mode === 'study') {
      const [nextSessions, nextSummary] = await Promise.all([
        fetchStudySessions(accessToken),
        fetchStudySummary(accessToken),
      ]);
      setSessions(nextSessions);
      setStudySummary(nextSummary);
    } else {
      const [entries, summary] = await Promise.all([
        fetchTodayWellness(accessToken),
        fetchWellnessSummary(accessToken),
      ]);
      setWellnessEntries(entries);
      setWellnessSummary(summary);
    }
  }, [accessToken, mode]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => refresh())
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load this screen.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (mode === 'study') {
        const durationMinutes = Number(sessionForm.durationMinutes);
        await createStudySession(accessToken, {
          subject: sessionForm.subject.trim(),
          topic: sessionForm.topic.trim(),
          durationMinutes,
          notes: sessionForm.notes.trim(),
          projectId: sessionForm.projectId || null,
        });
        setSessionForm({ subject: '', topic: '', durationMinutes: '', notes: '', projectId: '' });
      } else {
        const quantity = wellnessForm.quantity.trim() ? Number(wellnessForm.quantity) : null;
        await createWellnessEntry(accessToken, {
          kind: wellnessForm.kind,
          label: wellnessForm.label.trim(),
          quantity,
          unit: wellnessForm.unit.trim(),
          notes: wellnessForm.notes.trim(),
        });
        setWellnessForm((current) => ({ ...current, label: '', quantity: '', unit: '', notes: '' }));
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The entry could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeWellnessEntry = async (entryId: string) => {
    setError('');
    try {
      await archiveWellnessEntry(accessToken, entryId);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The entry could not be deleted.');
    }
  };

  return (
    <section className="screen-grid study-wellness-screen">
      {error && <div className="error-banner" role="alert">{error}</div>}
      {mode === 'study' ? (
        <>
          <article className="panel">
            <div className="panel-header">
              <div><p className="eyebrow accent">Learn deliberately</p><h3>Study overview</h3></div>
              <span className="pill neutral">Last 90 days</span>
            </div>
            <div className="rhythm-grid">
              <div><span>Study time this week</span><strong>{Math.floor(studySummary.minutesThisWeek / 60)}h {studySummary.minutesThisWeek % 60}m</strong></div>
              <div><span>Study sessions</span><strong>{studySummary.sessionCount}</strong></div>
              <div><span>Study days</span><strong>{studySummary.studyDays}</strong></div>
              <div><span>Total study time</span><strong>{Math.floor(studySummary.totalMinutes / 60)}h {studySummary.totalMinutes % 60}m</strong></div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header"><h3>Record a study session</h3></div>
            <form className="data-form study-form" onSubmit={(event) => void submit(event)}>
              <label>Subject<input value={sessionForm.subject} onChange={(event) => setSessionForm((value) => ({ ...value, subject: event.target.value }))} maxLength={120} required /></label>
              <label>Topic<input value={sessionForm.topic} onChange={(event) => setSessionForm((value) => ({ ...value, topic: event.target.value }))} maxLength={200} /></label>
              <label>Duration in minutes<input type="number" min="1" max="1440" value={sessionForm.durationMinutes} onChange={(event) => setSessionForm((value) => ({ ...value, durationMinutes: event.target.value }))} required /></label>
              <label>Related project
                <select value={sessionForm.projectId} onChange={(event) => setSessionForm((value) => ({ ...value, projectId: event.target.value }))}>
                  <option value="">No linked project</option>
                  {projects.filter((project) => project.status !== 'ARCHIVED').map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                </select>
              </label>
              <label>Notes<textarea value={sessionForm.notes} onChange={(event) => setSessionForm((value) => ({ ...value, notes: event.target.value }))} maxLength={2000} rows={3} /></label>
              <button type="submit" className="secondary-button" disabled={saving}>{saving ? 'Saving…' : 'Save study session'}</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header"><h3>Recent study sessions</h3><span className="pill neutral">Latest 30</span></div>
            {loading ? <p className="empty-state">Loading study history…</p> : sessions.length ? (
              <div className="module-entry-list">
                {sessions.map((session) => (
                  <article className="module-entry" key={session.id}>
                    {editingSessionId === session.id ? (
                      <form className="data-form study-form" onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        setSaving(true);
                        void updateStudySession(accessToken, session.id, {
                          subject: String(form.get('subject')).trim(),
                          topic: String(form.get('topic')).trim(),
                          durationMinutes: Number(form.get('duration')),
                          notes: String(form.get('notes')).trim(),
                          sessionDate: String(form.get('date')),
                          projectId: String(form.get('projectId')) || null,
                        }).then(refresh).then(() => setEditingSessionId(null)).catch((reason: unknown) => {
                          setError(reason instanceof Error ? reason.message : 'Could not update study session.');
                        }).finally(() => setSaving(false));
                      }}>
                        <label>Subject<input name="subject" defaultValue={session.subject} maxLength={120} required /></label>
                        <label>Topic<input name="topic" defaultValue={session.topic} maxLength={200} /></label>
                        <label>Duration in minutes<input name="duration" type="number" min="1" max="1440" defaultValue={session.durationMinutes} required /></label>
                        <label>Date<input name="date" type="date" defaultValue={session.sessionDate} required /></label>
                        <label>Related project<select name="projectId" defaultValue={session.projectId ?? ''}>
                          <option value="">No linked project</option>
                          {projects.filter((project) => project.status !== 'ARCHIVED').map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
                        </select></label>
                        <label>Notes<textarea name="notes" defaultValue={session.notes} maxLength={2000} rows={3} /></label>
                        <button className="inline-button" type="submit" disabled={saving}>Save</button>
                        <button className="inline-button" type="button" onClick={() => setEditingSessionId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="goal-topline"><strong>{session.subject}{session.topic ? ` · ${session.topic}` : ''}</strong><span>{session.durationMinutes} min</span></div>
                        <small>{session.sessionDate}{session.projectName ? ` · ${session.projectName}` : ''}</small>
                        {session.notes && <p>{session.notes}</p>}
                        <button type="button" className="inline-button" onClick={() => setEditingSessionId(session.id)}>Edit</button>
                        <button type="button" className="inline-button danger-button" disabled={saving} onClick={() => {
                          setSaving(true);
                          void archiveStudySession(accessToken, session.id).then(refresh).catch((reason: unknown) => {
                            setError(reason instanceof Error ? reason.message : 'Could not archive study session.');
                          }).finally(() => setSaving(false));
                        }}>Archive</button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">No study sessions yet. Record a session to begin your study history.</p>}
          </article>
        </>
      ) : (
        <>
          <article className="panel">
            <div className="panel-header">
              <div><p className="eyebrow accent">Support your energy</p><h3>Wellness overview</h3></div>
              <span className="pill neutral">Last 30 days</span>
            </div>
            {wellnessSummary.last30Days.length ? (
              <div className="rhythm-grid">
                {wellnessSummary.last30Days.map((item) => (
                  <div key={`${item.kind}-${item.unit}`}>
                    <span>{kindLabel(item.kind)}</span>
                    <strong>{item.entryCount} entries</strong>
                    {item.unit && <small>{item.totalQuantity.toLocaleString()} {item.unit}</small>}
                  </div>
                ))}
              </div>
            ) : <p className="empty-state">Your wellness summary will appear as you record entries. It is for reflection, not a score or diagnosis.</p>}
          </article>

          <article className="panel">
            <div className="panel-header"><h3>Record a wellness entry</h3></div>
            <form className="data-form study-form" onSubmit={(event) => void submit(event)}>
              <label>Activity type
                <select value={wellnessForm.kind} onChange={(event) => setWellnessForm((value) => ({ ...value, kind: event.target.value as WellnessKind }))}>
                  {wellnessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>Name or description<input value={wellnessForm.label} onChange={(event) => setWellnessForm((value) => ({ ...value, label: event.target.value }))} maxLength={160} placeholder="e.g. Walk, breakfast, water" required /></label>
              <div className="form-fields">
                <label>Quantity (optional)<input type="number" min="0" step="0.01" value={wellnessForm.quantity} onChange={(event) => setWellnessForm((value) => ({ ...value, quantity: event.target.value }))} /></label>
                <label>Unit<input value={wellnessForm.unit} onChange={(event) => setWellnessForm((value) => ({ ...value, unit: event.target.value }))} maxLength={30} placeholder="ml, hours, servings…" /></label>
              </div>
              <label>Notes<textarea value={wellnessForm.notes} onChange={(event) => setWellnessForm((value) => ({ ...value, notes: event.target.value }))} maxLength={2000} rows={3} /></label>
              <button type="submit" className="secondary-button" disabled={saving}>{saving ? 'Saving…' : 'Save wellness entry'}</button>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header"><h3>Today’s wellness entries</h3><span className="pill neutral">{wellnessEntries.length} recorded</span></div>
            {loading ? <p className="empty-state">Loading today’s entries…</p> : wellnessEntries.length ? (
              <div className="module-entry-list">
                {wellnessEntries.map((entry) => (
                  <article className="module-entry" key={entry.id}>
                    {editingWellnessId === entry.id ? (
                      <form className="data-form study-form" onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const quantityValue = String(form.get('quantity')).trim();
                        setSaving(true);
                        void updateWellnessEntry(accessToken, entry.id, {
                          kind: String(form.get('kind')) as WellnessKind,
                          label: String(form.get('label')).trim(),
                          quantity: quantityValue ? Number(quantityValue) : null,
                          unit: String(form.get('unit')).trim(),
                          notes: String(form.get('notes')).trim(),
                          entryDate: String(form.get('date')),
                        }).then(refresh).then(() => setEditingWellnessId(null)).catch((reason: unknown) => {
                          setError(reason instanceof Error ? reason.message : 'Could not update wellness entry.');
                        }).finally(() => setSaving(false));
                      }}>
                        <label>Activity type<select name="kind" defaultValue={entry.kind}>
                          {wellnessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select></label>
                        <label>Name or description<input name="label" defaultValue={entry.label} maxLength={160} required /></label>
                        <label>Quantity<input name="quantity" type="number" min="0" step="0.01" defaultValue={entry.quantity ?? ''} /></label>
                        <label>Unit<input name="unit" defaultValue={entry.unit} maxLength={30} /></label>
                        <label>Date<input name="date" type="date" defaultValue={entry.entryDate} required /></label>
                        <label>Notes<textarea name="notes" defaultValue={entry.notes} maxLength={2000} rows={3} /></label>
                        <button className="inline-button" type="submit" disabled={saving}>Save</button>
                        <button className="inline-button" type="button" onClick={() => setEditingWellnessId(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <div className="goal-topline"><strong>{entry.label}</strong><span className="pill neutral">{kindLabel(entry.kind)}</span></div>
                        <small>{entry.entryDate} · {entry.quantity !== null ? `${entry.quantity} ${entry.unit}` : 'No quantity recorded'}</small>
                        {entry.notes && <p>{entry.notes}</p>}
                        <button type="button" className="inline-button" onClick={() => setEditingWellnessId(entry.id)}>Edit</button>
                        <button type="button" className="inline-button danger-button" disabled={saving} onClick={() => void removeWellnessEntry(entry.id)}>Archive</button>
                      </>
                    )}
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">Nothing recorded today. Add only the wellness details that are useful to you.</p>}
          </article>
        </>
      )}
    </section>
  );
}
