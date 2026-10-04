import { useEffect, useState, type FormEvent } from 'react';
import { API_BASE_URL } from '../services/apiOrigin';

type FinancialGoal = {
  id: string;
  name: string;
  currency: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
};
type Budget = {
  id: string;
  category: string;
  currency: string;
  monthlyLimit: number;
  spentThisMonth: number;
};
type Planning = { goals: FinancialGoal[]; budgets: Budget[] };
type Props = { token: string };

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
    throw new Error(result.error?.message ?? 'Could not update financial planning.');
  }
  return result.data as T;
};

export function FinancePlanningScreen({ token }: Props) {
  const [planning, setPlanning] = useState<Planning>({ goals: [], budgets: [] });
  const [error, setError] = useState('');

  const load = async () => setPlanning(await request<Planning>(token, '/finance/planning'));
  useEffect(() => {
    let active = true;
    void request<Planning>(token, '/finance/planning')
      .then((result) => { if (active) setPlanning(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load financial planning.'); });
    return () => { active = false; };
  }, [token]);

  const submit = (kind: 'goal' | 'budget') => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError('');
    try {
      if (kind === 'goal') {
        await request(token, '/finance/goals', {
          method: 'POST',
          body: JSON.stringify({
            name: String(form.get('name')),
            targetAmount: Number(form.get('amount')),
            currentAmount: Number(form.get('current') || 0),
            currency: String(form.get('currency') || 'USD'),
            targetDate: String(form.get('date') || '') || null,
          }),
        });
      } else {
        await request(token, '/finance/budgets', {
          method: 'POST',
          body: JSON.stringify({
            category: String(form.get('category')),
            monthlyLimit: Number(form.get('amount')),
            currency: String(form.get('currency') || 'USD'),
          }),
        });
      }
      formElement.reset();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save financial plan.');
    }
  };

  return (
    <section className="content-grid screen-grid finance-planning">
      {error && <div className="error-banner" role="alert">{error}</div>}
      <article className="panel">
        <div className="panel-header"><h3>Financial goals</h3></div>
        {planning.goals.map((goal) => {
          const progress = Math.min(100, Math.round(goal.currentAmount / goal.targetAmount * 100));
          return (
            <form className="finance-plan-row" key={goal.id} onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setError('');
              try {
                await request(token, `/finance/goals/${encodeURIComponent(goal.id)}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ currentAmount: Number(form.get('currentAmount')) }),
                });
                await load();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Could not update financial goal.');
              }
            }}>
              <strong>{goal.name} · {progress}%</strong>
              <small>{goal.currentAmount} / {goal.targetAmount} {goal.currency}{goal.targetDate ? ` · ${goal.targetDate}` : ''}</small>
              <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
              <input aria-label={`${goal.name} current amount`} name="currentAmount" type="number" min="0" step="0.01" defaultValue={goal.currentAmount} />
              <button className="inline-button" type="submit">Update</button>
            </form>
          );
        })}
        <form className="data-form finance-plan-form" onSubmit={(event) => void submit('goal')(event)}>
          <h4>Add a financial goal</h4>
          <input name="name" placeholder="Goal name" required maxLength={120} />
          <input name="amount" type="number" min="0.01" step="0.01" placeholder="Target amount" required />
          <input name="current" type="number" min="0" step="0.01" placeholder="Already saved" />
          <input name="currency" defaultValue="USD" placeholder="Currency" maxLength={3} required />
          <input name="date" type="date" aria-label="Financial goal target date" />
          <button className="secondary-button" type="submit">Add goal</button>
        </form>
      </article>
      <article className="panel">
        <div className="panel-header"><h3>Monthly budgets</h3></div>
        {planning.budgets.map((budget) => {
          const percent = Math.min(100, Math.round(budget.spentThisMonth / budget.monthlyLimit * 100));
          return (
            <div className="finance-plan-row" key={budget.id}>
              <strong>{budget.category} · {budget.currency}</strong>
              <small>{budget.spentThisMonth} / {budget.monthlyLimit} spent this month</small>
              <div className="progress-bar"><span style={{ width: `${percent}%` }} /></div>
            </div>
          );
        })}
        <form className="data-form finance-plan-form" onSubmit={(event) => void submit('budget')(event)}>
          <h4>Set a monthly budget</h4>
          <input name="category" placeholder="Category (matched in expense description)" required maxLength={80} />
          <input name="amount" type="number" min="0.01" step="0.01" placeholder="Monthly limit" required />
          <input name="currency" defaultValue="USD" placeholder="Currency" maxLength={3} required />
          <button className="secondary-button" type="submit">Save budget</button>
        </form>
        <p className="muted">Budget spending is estimated by matching the category text in decreases recorded against accounts using the same currency.</p>
      </article>
    </section>
  );
}
