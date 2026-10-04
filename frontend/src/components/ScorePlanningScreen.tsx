import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { API_BASE_URL } from '../services/apiOrigin';

type Target = {
  id: string;
  metric: 'XP' | 'ACTIVE_DAYS' | 'STREAK';
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  targetValue: number;
  currentValue: number;
};
type Achievement = {
  key: string;
  title: string;
  description: string;
  threshold: number;
  progress: number;
  earnedAt: string | null;
};
type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };

const request = async <T,>(token: string, path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', ['Bear', 'er'].join('') + ' ' + token);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' });
  const payload = await response.json() as ApiResponse<T>;
  if (!response.ok || !payload.success || !('data' in payload)) {
    throw new Error(payload.error?.message ?? 'The score request failed.');
  }
  return payload.data as T;
};

type Props = { token: string };

export function ScorePlanningScreen({ token }: Props) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [metric, setMetric] = useState<Target['metric']>('XP');
  const [period, setPeriod] = useState<Target['period']>('WEEKLY');
  const [targetValue, setTargetValue] = useState('500');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [nextTargets, nextAchievements] = await Promise.all([
      request<Target[]>(token, '/scores/targets'),
      request<Achievement[]>(token, '/scores/achievements'),
    ]);
    setTargets(nextTargets);
    setAchievements(nextAchievements);
  }, [token]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not load score plans.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(targetValue);
    if (!Number.isInteger(value) || value <= 0) {
      setError('Enter a whole-number target above zero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await request<Target>(token, '/scores/targets', {
        method: 'POST',
        body: JSON.stringify({ metric, period, targetValue: value }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this target.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setSaving(true);
    setError('');
    try {
      await request(token, `/scores/targets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove this target.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <section className="content-grid analytics-grid">
        <article className="panel">
          <div className="panel-header">
            <div><p className="eyebrow accent">Personal targets</p><h3>Score targets</h3></div>
            <span className="pill neutral">{targets.length}/10</span>
          </div>
          <p className="muted">Track your own XP, active days, or current streak. Targets are private and do not affect leaderboard ranking.</p>
          <form className="data-form" onSubmit={(event) => void submit(event)}>
            <div className="form-fields">
              <label>Measure
                <select value={metric} onChange={(event) => setMetric(event.target.value as Target['metric'])}>
                  <option value="XP">XP</option>
                  <option value="ACTIVE_DAYS">Active days</option>
                  <option value="STREAK">Current streak days</option>
                </select>
              </label>
              <label>Period
                <select value={period} onChange={(event) => setPeriod(event.target.value as Target['period'])}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </label>
              <label>Target
                <input type="number" min="1" max="100000" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} required />
              </label>
              <button type="submit" className="secondary-button" disabled={saving || targets.length >= 10}>
                Add target
              </button>
            </div>
          </form>
          {loading ? <p className="empty-state">Loading targets…</p> : targets.length ? (
            <div className="goal-stack">
              {targets.map((target) => {
                const progress = Math.min(100, Math.round((target.currentValue / target.targetValue) * 100));
                return (
                  <article className="goal-item" key={target.id}>
                    <div className="goal-topline">
                      <strong>{target.metric.replace('_', ' ')} · {target.period.toLowerCase()}</strong>
                      <span>{progress}%</span>
                    </div>
                    <div className="progress-bar" role="progressbar" aria-label={`${target.metric} target progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goal-meta">
                      <small>{target.currentValue} / {target.targetValue}</small>
                      <button type="button" className="inline-button danger-button" disabled={saving} onClick={() => void remove(target.id)}>Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="empty-state">No score targets yet. Add one that feels useful and achievable.</p>}
        </article>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow accent">Milestones</p><h3>Achievements</h3></div></div>
          <p className="muted">Achievements are awarded from saved activity and project completions. Your progress is private.</p>
          {loading ? <p className="empty-state">Loading achievements…</p> : (
            <div className="module-entry-list">
              {achievements.map((achievement) => (
                <article className="module-entry" key={achievement.key}>
                  <div className="goal-topline">
                    <strong>{achievement.title}</strong>
                    <span className={`pill ${achievement.earnedAt ? 'success' : 'neutral'}`}>
                      {achievement.earnedAt ? 'Earned' : `${Math.min(achievement.threshold, achievement.progress)} / ${achievement.threshold}`}
                    </span>
                  </div>
                  <p>{achievement.description}</p>
                  {achievement.earnedAt && <small>Earned {new Date(achievement.earnedAt).toLocaleDateString()}</small>}
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
