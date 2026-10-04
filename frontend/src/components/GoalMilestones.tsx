import { useEffect, useState, type FormEvent } from 'react';

import { API_BASE_URL } from '../services/apiOrigin';

type Milestone = {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  targetDate: string | null;
  completedAt: string | null;
};

type Props = { token: string; goalId: string };

const request = async <T,>(token: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json() as { success: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !result.success || !('data' in result)) {
    throw new Error(result.error?.message ?? 'Could not save milestone.');
  }
  return result.data as T;
};

export function GoalMilestones({ token, goalId }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setMilestones(await request<Milestone[]>(token, `/goals/${encodeURIComponent(goalId)}/milestones`));
  };

  useEffect(() => {
    let active = true;
    void request<Milestone[]>(token, `/goals/${encodeURIComponent(goalId)}/milestones`)
      .then((items) => { if (active) setMilestones(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load milestones.'); });
    return () => { active = false; };
  }, [goalId, token]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      await request(token, `/goals/${encodeURIComponent(goalId)}/milestones`, {
        method: 'POST',
        body: JSON.stringify({ title, targetValue: Number(target), targetDate: targetDate || null }),
      });
      setTitle('');
      setTarget('');
      setTargetDate('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create milestone.');
    }
  };

  return (
    <div className="milestones-panel">
      <strong>Milestones</strong>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {milestones.map((milestone) => (
        <form className="milestone-row" key={milestone.id} onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setError('');
          try {
            await request(token, `/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(milestone.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ currentValue: Number(form.get('currentValue')) }),
            });
            await load();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not update milestone.');
          }
        }}>
          <span>{milestone.title}{milestone.targetDate ? ` · ${milestone.targetDate}` : ''}</span>
          <small>{milestone.currentValue} / {milestone.targetValue}{milestone.completedAt ? ' · Complete' : ''}</small>
          <input aria-label={`${milestone.title} progress`} name="currentValue" type="number" min="0" step="any" defaultValue={milestone.currentValue} />
          <button type="submit" className="inline-button">Save progress</button>
        </form>
      ))}
      <form className="milestone-create" onSubmit={(event) => void submit(event)}>
        <input aria-label="Milestone title" placeholder="Milestone" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} required />
        <input aria-label="Milestone target" type="number" min="0.01" step="any" placeholder="Target" value={target} onChange={(event) => setTarget(event.target.value)} required />
        <input aria-label="Milestone date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        <button className="inline-button" type="submit">Add milestone</button>
      </form>
    </div>
  );
}
