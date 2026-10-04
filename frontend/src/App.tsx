import { useCallback, useEffect, useMemo, useState } from 'react';

import { AuthForm } from './components/AuthForm';
import { ArchiveScreen } from './components/ArchiveScreen';
import { ChatPanel } from './components/ChatPanel';
import { GoalMilestones } from './components/GoalMilestones';
import { WeekdayPicker } from './components/WeekdayPicker';
import { ScorePlanningScreen } from './components/ScorePlanningScreen';
import { FinancePlanningScreen } from './components/FinancePlanningScreen';
import { HelpScreen } from './components/HelpScreen';
import { StudyWellnessScreen } from './components/StudyWellnessScreen';
import { PlatformScreen } from './components/PlatformScreen';
import {
  ApiError,
  archiveFinancialAccount,
  archiveRoutine,
  archiveProject,
  archiveGoal,
  archiveTask,
  checkInTask,
  checkInRoutine,
  confirmEmailVerification,
  createFinancialAccount,
  createFinancialEntry,
  fetchAnalyticsSummary,
  createGoal,
  createTask,
  createRoutine,
  createProject,
  fetchCurrentUser,
  fetchDashboardOverview,
  fetchFinanceSummary,
  fetchGoalsSummary,
  fetchScoreSummary,
  fetchTaskBoard,
  fetchRoutineBoard,
  fetchTodayReview,
  fetchReviewHistory,
  fetchProjects,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  refreshSession,
  registerUser,
  saveTodayReview,
  updateProject,
  updateGoalProgress,
  updateTask,
  updateRoutine,
} from './services/api';
import type {
  AnalyticsSummary,
  AuthUser,
  DailyReview,
  DashboardOverview,
  FinanceSummary,
  GoalSummaryResponse,
  Project,
  ScoreSummary,
  Routine,
  Task,
} from './types/auth';
import './App.css';

type Session = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

const STORAGE_KEY = 'discipline-os-session';

const screens = [
  { id: 'dashboard', label: 'Dashboard', description: 'Your daily operating overview.' },
  { id: 'tasks', label: 'Tasks', description: 'Plan work and record daily completion.' },
  { id: 'archive', label: 'Archive', description: 'Review and restore archived records.' },
  { id: 'goals', label: 'Goals', description: 'Track measurable outcomes over time.' },
  { id: 'routines', label: 'Routines', description: 'Build repeatable habits on a weekly schedule.' },
  { id: 'reflection', label: 'Reflection', description: 'Capture daily wins, energy, and lessons.' },
  { id: 'projects', label: 'Projects', description: 'Manage active work and progress.' },
  { id: 'study', label: 'Study', description: 'Record focused sessions and review study time.' },
  { id: 'wellness', label: 'Wellness', description: 'Keep a flexible personal record of wellness activities.' },
  { id: 'wealth', label: 'Wealth', description: 'Track accounts, balances, and financial entries.' },
  { id: 'leaderboard', label: 'Leaderboard', description: 'Compare opt-in activity for the current period.' },
  { id: 'notifications', label: 'Notifications', description: 'Review chat activity and notification preferences.' },
  { id: 'profile', label: 'Profile', description: 'Review and update your display name and privacy settings.' },
  { id: 'analytics', label: 'Analytics', description: 'Review scores, consistency, and category performance.' },
  { id: 'chat', label: 'Chat', description: 'Message people and groups in real time.' },
  { id: 'help', label: 'Help & guide', description: 'Learn every feature and the terms used in Discipline OS.' },
  { id: 'admin', label: 'Admin', description: 'Manage accounts and review administrative activity.' },
] as const;

type ScreenId = (typeof screens)[number]['id'];
type PlatformScreenId = 'leaderboard' | 'notifications' | 'profile' | 'admin';

const isPlatformScreen = (screen: ScreenId): screen is PlatformScreenId =>
  screen === 'leaderboard'
  || screen === 'notifications'
  || screen === 'profile'
  || screen === 'admin';

const getScreenFromHash = (): ScreenId => {
  const value = window.location.hash.slice(1);
  if (value.startsWith('guide-')) return 'help';
  return screens.some((screen) => screen.id === value) ? value as ScreenId : 'dashboard';
};

const readSession = (): Session | null => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Session;
    if (
      typeof value.accessToken !== 'string' ||
      typeof value.refreshToken !== 'string' ||
      typeof value.user?.id !== 'string'
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    if (new URLSearchParams(window.location.search).has('reset_token')) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return readSession();
  });
  const [activeScreen, setActiveScreen] = useState<ScreenId>(() => getScreenFromHash());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(
    () => new URLSearchParams(window.location.search).has('reset_token')
      || new URLSearchParams(window.location.search).has('verify_token'),
  );
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [goalSummary, setGoalSummary] = useState<GoalSummaryResponse | null>(null);
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [todayReview, setTodayReview] = useState<DailyReview | null>(null);
  const [reviewHistory, setReviewHistory] = useState<DailyReview[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [taskForm, setTaskForm] = useState({
    title: '',
    category: '',
    points: '',
    priority: 'MEDIUM' as Task['priority'],
    dueDate: '',
    scheduleWeekdays: [] as number[],
    tags: '',
    projectId: '',
  });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditForm, setTaskEditForm] = useState({
    title: '',
    category: '',
    points: '',
    priority: 'MEDIUM' as Task['priority'],
    dueDate: '',
    scheduleWeekdays: [] as number[],
    tags: '',
    projectId: '',
  });
  const [goalForm, setGoalForm] = useState({ name: '', targetValue: '' });
  const [routineForm, setRoutineForm] = useState({
    title: '',
    category: '',
    points: '',
    weekdays: [1, 2, 3, 4, 5],
  });
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [routineEditForm, setRoutineEditForm] = useState({
    title: '',
    category: '',
    points: '',
    weekdays: [] as number[],
  });
  const [reviewForm, setReviewForm] = useState({
    mood: '',
    energy: '',
    wins: '',
    improvements: '',
    notes: '',
  });
  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    dueDate: '',
  });
  const [accountForm, setAccountForm] = useState({
    name: '',
    kind: 'ASSET' as 'ASSET' | 'LIABILITY',
    currency: 'USD',
    openingBalance: '',
  });
  const [entryForms, setEntryForms] = useState<
    Record<string, { description: string; amount: string; direction: 'INCREASE' | 'DECREASE' }>
  >({});
  const [pendingAction, setPendingAction] = useState('');

  const saveSession = (next: Session | null) => {
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  };

  const loadData = useCallback(async (
    accessToken: string,
    refreshToken: string,
  ) => {
    setIsLoading(true);
    setError('');
    try {
      const fetchData = (token: string) =>
        Promise.all([
          fetchDashboardOverview(token),
          fetchAnalyticsSummary(token),
          fetchGoalsSummary(token),
          fetchScoreSummary(token),
          fetchTaskBoard(token),
          fetchRoutineBoard(token),
          fetchTodayReview(token),
          fetchReviewHistory(token),
          fetchProjects(token),
          fetchFinanceSummary(token),
          fetchCurrentUser(token),
        ]);
      let authenticatedSession: Session | null = null;
      let data: Awaited<ReturnType<typeof fetchData>>;
      try {
        data = await fetchData(accessToken);
      } catch (requestError) {
        if (!(requestError instanceof ApiError) || requestError.status !== 401) {
          throw requestError;
        }
        const refreshed = await refreshSession(refreshToken);
        authenticatedSession = {
          accessToken: refreshed.tokens.accessToken,
          refreshToken: refreshed.tokens.refreshToken,
          user: refreshed.user,
        };
        saveSession(authenticatedSession);
        setSession(authenticatedSession);
        data = await fetchData(authenticatedSession.accessToken);
      }
      const [
        dashboard,
        analysis,
        goals,
        scores,
        taskBoard,
        routineBoard,
        dailyReview,
        reviewList,
        projectList,
        financeSummary,
        currentUser,
      ] = data;
      setOverview(dashboard);
      setAnalytics(analysis);
      setGoalSummary(goals);
      setScoreSummary(scores);
      setTasks(taskBoard);
      setRoutines(routineBoard);
      setTodayReview(dailyReview);
      setReviewHistory(reviewList);
      setProjects(projectList);
      setFinance(financeSummary);
      setReviewForm({
        mood: dailyReview?.mood?.toString() ?? '',
        energy: dailyReview?.energy?.toString() ?? '',
        wins: dailyReview?.wins ?? '',
        improvements: dailyReview?.improvements ?? '',
        notes: dailyReview?.notes ?? '',
      });
      setSession((current) => {
        const activeSession = authenticatedSession ?? current;
        if (!activeSession) {
          return current;
        }
        const updated = { ...activeSession, user: currentUser.user };
        saveSession(updated);
        return updated;
      });
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        saveSession(null);
        setSession(null);
        setOverview(null);
        setAnalytics(null);
        setGoalSummary(null);
        setScoreSummary(null);
        setTasks([]);
        setRoutines([]);
        setTodayReview(null);
        setReviewHistory([]);
        setProjects([]);
        setFinance(null);
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load your data from the server.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const accessToken = session?.accessToken;
  const refreshToken = session?.refreshToken;

  useEffect(() => {
    if (accessToken && refreshToken) {
      void Promise.resolve().then(() => loadData(accessToken, refreshToken));
    }
  }, [accessToken, loadData, refreshToken]);

  useEffect(() => {
    const syncScreen = () => setActiveScreen(getScreenFromHash());
    window.addEventListener('hashchange', syncScreen);
    return () => window.removeEventListener('hashchange', syncScreen);
  }, []);

  useEffect(() => {
    if (activeScreen === 'admin' && session?.user.role !== 'ADMIN') {
      window.location.hash = 'dashboard';
    }
  }, [activeScreen, session?.user.role]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('verify_token');
    if (!session || !token) return;
    let active = true;
    void confirmEmailVerification(token).then((result) => {
      if (!active) return;
      setActionNotice(result.message);
      window.location.hash = 'profile';
      setActiveScreen('profile');
      setMobileMenuOpen(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('verify_token');
      window.history.replaceState({}, '', url);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Email verification failed.');
    });
    return () => { active = false; };
  }, [session]);

  const navigateTo = (screen: ScreenId) => {
    window.location.hash = screen;
    setActiveScreen(screen);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuth = async (payload: {
    name?: string;
    username?: string;
    email: string;
    password: string;
  }): Promise<{ emailVerificationStatus?: string } | void> => {
    setIsBusy(true);
    try {
      const authenticated =
        authMode === 'login'
          ? await loginUser(payload.email, payload.password)
          : await registerUser(payload.name ?? '', payload.username ?? '', payload.email, payload.password);
      const nextSession: Session = {
        accessToken: authenticated.tokens.accessToken,
        refreshToken: authenticated.tokens.refreshToken,
        user: authenticated.user,
      };
      saveSession(nextSession);
      setSession(nextSession);
      if (authenticated.emailVerificationStatus === 'sent') {
        setActionNotice('A verification link was sent to your email address.');
      } else if (authenticated.emailVerificationStatus === 'delivery-failed') {
        setActionNotice('Your account was created, but the verification email could not be delivered. Request another link from Profile.');
      } else if (authenticated.emailVerificationStatus === 'email-provider-not-configured') {
        setActionNotice('Your account was created. Email verification is pending because email delivery is not configured.');
      }
      return authMode === 'register'
        ? { emailVerificationStatus: authenticated.emailVerificationStatus }
        : undefined;
    } finally {
      setIsBusy(false);
    }
  };

  const logout = async () => {
    if (session) {
      try {
        await logoutUser(session.accessToken);
      } catch (logoutError) {
        setError(
          logoutError instanceof Error
            ? `Server logout failed: ${logoutError.message}`
            : 'Server logout failed.',
        );
      }
    }
    saveSession(null);
    setSession(null);
    setOverview(null);
    setAnalytics(null);
    setGoalSummary(null);
    setScoreSummary(null);
    setTasks([]);
    setRoutines([]);
    setTodayReview(null);
    setReviewHistory([]);
    setProjects([]);
    setFinance(null);
    setIsLoading(false);
  };

  const runAction = async (actionId: string, action: () => Promise<void>) => {
    setPendingAction(actionId);
    setError('');
    try {
      await action();
      if (session) {
        await loadData(session.accessToken, session.refreshToken);
      }
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'The requested change could not be saved.',
      );
    } finally {
      setPendingAction('');
    }
  };

  const initials = useMemo(() => {
    const name = session?.user.name ?? '';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }, [session?.user.name]);

  if (!session) {
    return (
      <div className="app-shell auth-shell">
        <div className="auth-layout">
          <section className="feature-panel">
            <p className="eyebrow">Discipline OS</p>
            <h1>Build a life that compounds with intention.</h1>
            <p className="muted">
              Sign in to manage your daily tasks, record progress, and track goals.
              Your account data is loaded from the server.
            </p>
          </section>

          <section className="auth-panel">
            {error && <div className="error-banner" role="alert">{error}</div>}
            {!passwordRecoveryOpen && <div className="toggle-row">
              <button
                type="button"
                className={authMode === 'login' ? 'toggle active' : 'toggle'}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'toggle active' : 'toggle'}
                onClick={() => setAuthMode('register')}
              >
                Register
              </button>
            </div>}
            <AuthForm
              mode={authMode}
              isBusy={isBusy}
              onSubmit={handleAuth}
              onRequestPasswordReset={async (email) => {
                setIsBusy(true);
                try {
                  return await requestPasswordReset(email);
                } finally {
                  setIsBusy(false);
                }
              }}
              onResetPassword={async (token, password) => {
                setIsBusy(true);
                try {
                  return await resetPassword(token, password);
                } finally {
                  setIsBusy(false);
                }
              }}
              onVerifyEmail={async (token) => {
                setIsBusy(true);
                try {
                  return await confirmEmailVerification(token);
                } finally {
                  setIsBusy(false);
                }
              }}
              onRecoveryModeChange={setPasswordRecoveryOpen}
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell workspace-shell">
      <aside className="app-sidebar">
        <div className="sidebar-topline">
          <a className="brand-lockup" href="#dashboard" onClick={() => navigateTo('dashboard')}>
            <span className="brand-mark" aria-hidden="true">D</span>
            <span><strong>Discipline OS</strong><small>Personal operating system</small></span>
          </a>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-expanded={mobileMenuOpen}
            aria-controls="main-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="main-navigation" className={mobileMenuOpen ? 'menu-open' : ''} aria-label="Main navigation">
          {screens.filter((screen) => screen.id !== 'admin' || session.user.role === 'ADMIN').map((screen) => (
            <button
              type="button"
              key={screen.id}
              className={`nav-link ${activeScreen === screen.id ? 'active' : ''}`}
              aria-current={activeScreen === screen.id ? 'page' : undefined}
              onClick={() => navigateTo(screen.id)}
            >
              {screen.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-profile">
          <span className="profile-badge">{initials}</span>
          <span><strong>{session.user.name}</strong><small>{session.user.role}</small></span>
          <button type="button" className="sidebar-logout" onClick={() => void logout()}>Log out</button>
        </div>
      </aside>

      <div className="workspace-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">Discipline OS / {screens.find((item) => item.id === activeScreen)?.label}</p>
          <h1>{screens.find((item) => item.id === activeScreen)?.label}</h1>
          <p className="screen-description">{screens.find((item) => item.id === activeScreen)?.description}</p>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={isLoading}
            onClick={() => void loadData(session.accessToken, session.refreshToken)}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
          <button type="button" className="secondary-button mobile-logout" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard">
        {error && <div className="error-banner" role="alert">{error}</div>}
        {actionNotice && <div className="platform-notice" role="status">{actionNotice}</div>}
        {isLoading && !overview ? (
          <section className="panel loading-panel" aria-live="polite">
            Loading your data from the server…
          </section>
        ) : overview ? (
          <>
            {activeScreen === 'dashboard' && <>
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow accent">Core loop</p>
                <h2>{overview.headline}</h2>
                <p className="muted">
                  Your dashboard reflects the tasks, check-ins, and goals saved to
                  your account.
                </p>
              </div>
              <div className="hero-card">
                <span className="profile-badge">{initials}</span>
                <div>
                  <strong>{overview.user.name}</strong>
                  <small>{overview.user.role}</small>
                </div>
              </div>
            </section>

            <section className="metrics-grid">
              {overview.metrics.map((metric) => (
                <article key={metric.label} className="metric-card">
                  <span className="metric-label">{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small className={`metric-change ${metric.tone}`}>
                    {metric.change}
                  </small>
                </article>
              ))}
            </section>
            <div className="dashboard-shortcuts" aria-label="Quick navigation">
              {(['tasks', 'reflection', 'analytics'] as const).map((screen) => (
                <button type="button" key={screen} className="secondary-button" onClick={() => navigateTo(screen)}>
                  Open {screens.find((item) => item.id === screen)?.label}
                </button>
              ))}
            </div>
            </>}

            <section className="content-grid screen-grid">
              {activeScreen === 'tasks' && <article className="panel">
                <div className="panel-header">
                  <h3>Today's tasks</h3>
                  <span className="pill success">
                    {tasks.filter((task) => task.completed).length}/{tasks.length} complete
                  </span>
                </div>
                {tasks.length ? (
                  <ul className="task-list">
                    {tasks.map((task) => (
                      <li key={task.id} className={task.completed ? 'done' : ''}>
                        <span className="checkmark">{task.completed ? '✓' : '○'}</span>
                        {editingTaskId === task.id ? (
                          <form
                            className="task-edit-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const points = Number(taskEditForm.points);
                              if (!taskEditForm.title.trim() || !taskEditForm.category.trim() || points < 1) {
                                setError('Enter a task name, category, and positive XP value.');
                                return;
                              }
                              void runAction(`update-${task.id}`, async () => {
                                await updateTask(session.accessToken, task.id, {
                                  title: taskEditForm.title.trim(),
                                  category: taskEditForm.category.trim(),
                                  points,
                                  priority: taskEditForm.priority,
                                  dueDate: taskEditForm.dueDate || null,
                                  scheduleWeekdays: taskEditForm.scheduleWeekdays.length
                                    ? taskEditForm.scheduleWeekdays
                                    : null,
                                  tags: taskEditForm.tags
                                    .split(',')
                                    .map((tag) => tag.trim())
                                    .filter(Boolean),
                                  projectId: taskEditForm.projectId || null,
                                });
                                setEditingTaskId(null);
                              });
                            }}
                          >
                            <input
                              aria-label={`${task.title} name`}
                              value={taskEditForm.title}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({ ...current, title: event.target.value }))
                              }
                              required
                            />
                            <input
                              aria-label={`${task.title} category`}
                              value={taskEditForm.category}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({
                                  ...current,
                                  category: event.target.value,
                                }))
                              }
                              required
                            />
                            <input
                              aria-label={`${task.title} XP`}
                              type="number"
                              min="1"
                              max="1000"
                              value={taskEditForm.points}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({
                                  ...current,
                                  points: event.target.value,
                                }))
                              }
                              required
                            />
                            <select
                              aria-label={`${task.title} priority`}
                              value={taskEditForm.priority}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({
                                  ...current,
                                  priority: event.target.value === 'HIGH'
                                    ? 'HIGH'
                                    : event.target.value === 'LOW' ? 'LOW' : 'MEDIUM',
                                }))
                              }
                            >
                              <option value="LOW">Low priority</option>
                              <option value="MEDIUM">Medium priority</option>
                              <option value="HIGH">High priority</option>
                            </select>
                            <input
                              aria-label={`${task.title} due date`}
                              type="date"
                              value={taskEditForm.dueDate}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({ ...current, dueDate: event.target.value }))
                              }
                            />
                            <WeekdayPicker
                              label={`${task.title} recurrence`}
                              value={taskEditForm.scheduleWeekdays}
                              onChange={(scheduleWeekdays) =>
                                setTaskEditForm((current) => ({ ...current, scheduleWeekdays }))
                              }
                            />
                            <input
                              aria-label={`${task.title} tags`}
                              placeholder="Tags, comma separated"
                              value={taskEditForm.tags}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({ ...current, tags: event.target.value }))
                              }
                            />
                            <select
                              aria-label={`${task.title} project`}
                              value={taskEditForm.projectId}
                              onChange={(event) =>
                                setTaskEditForm((current) => ({ ...current, projectId: event.target.value }))
                              }
                            >
                              <option value="">No project</option>
                              {projects.filter((project) => project.status === 'ACTIVE').map((project) => (
                                <option key={project.id} value={project.id}>{project.name}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="inline-button"
                              disabled={Boolean(pendingAction)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="inline-button"
                              onClick={() => setEditingTaskId(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="task-detail">
                              <strong>{task.title}</strong>
                              <small>
                                {task.category} · {task.priority.toLowerCase()} priority
                                {task.dueDate ? ` · due ${task.dueDate}` : ''}
                                {task.scheduleWeekdays?.length ? ` · repeats ${task.scheduleWeekdays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}` : ''}
                                {task.projectName ? ` · ${task.projectName}` : ''}
                              </small>
                              {task.tags.length > 0 && <small>Tags: {task.tags.join(', ')}</small>}
                            </span>
                            <span className="points">+{task.points} XP</span>
                            <button
                              type="button"
                              className="inline-button"
                              disabled={task.completed || Boolean(pendingAction)}
                              onClick={() =>
                                void runAction(task.id, async () => {
                                  await checkInTask(session.accessToken, task.id);
                                })
                              }
                            >
                              {task.completed ? 'Done' : 'Check in'}
                            </button>
                            <button
                              type="button"
                              className="inline-button"
                              disabled={Boolean(pendingAction)}
                              onClick={() => {
                                setTaskEditForm({
                                  title: task.title,
                                  category: task.category,
                                  points: task.points.toString(),
                                  priority: task.priority,
                                  dueDate: task.dueDate ?? '',
                                  scheduleWeekdays: task.scheduleWeekdays ?? [],
                                  tags: task.tags.join(', '),
                                  projectId: task.projectId ?? '',
                                });
                                setEditingTaskId(task.id);
                              }}
                            >
                              Edit
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="inline-button danger-button"
                          disabled={Boolean(pendingAction) || editingTaskId === task.id}
                          aria-label={`Archive ${task.title}`}
                          onClick={() =>
                            void runAction(`archive-${task.id}`, async () => {
                              await archiveTask(session.accessToken, task.id);
                            })
                          }
                        >
                          Archive
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No tasks yet. Add one below to get started.</p>
                )}
                <form
                  className="data-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const points = Number(taskForm.points);
                    if (!taskForm.title.trim() || !taskForm.category.trim() || !points) {
                      setError('Enter a task name, category, and positive XP value.');
                      return;
                    }
                    void runAction('create-task', async () => {
                      await createTask(session.accessToken, {
                        title: taskForm.title.trim(),
                        category: taskForm.category.trim(),
                        points,
                        priority: taskForm.priority,
                        dueDate: taskForm.dueDate || null,
                        scheduleWeekdays: taskForm.scheduleWeekdays.length
                          ? taskForm.scheduleWeekdays
                          : null,
                        tags: taskForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
                        projectId: taskForm.projectId || null,
                      });
                      setTaskForm({
                        title: '',
                        category: '',
                        points: '',
                        priority: 'MEDIUM',
                        dueDate: '',
                        scheduleWeekdays: [],
                        tags: '',
                        projectId: '',
                      });
                    });
                  }}
                >
                  <h4>Add a task</h4>
                  <div className="form-fields">
                    <input
                      aria-label="Task name"
                      placeholder="Task name"
                      value={taskForm.title}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                    />
                    <input
                      aria-label="Category"
                      placeholder="Category"
                      value={taskForm.category}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, category: event.target.value }))
                      }
                      required
                    />
                    <input
                      aria-label="XP points"
                      type="number"
                      min="1"
                      max="1000"
                      placeholder="XP"
                      value={taskForm.points}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, points: event.target.value }))
                      }
                      required
                    />
                    <select
                      aria-label="Task priority"
                      value={taskForm.priority}
                      onChange={(event) =>
                        setTaskForm((current) => ({
                          ...current,
                          priority: event.target.value === 'HIGH'
                            ? 'HIGH'
                            : event.target.value === 'LOW' ? 'LOW' : 'MEDIUM',
                        }))
                      }
                    >
                      <option value="LOW">Low priority</option>
                      <option value="MEDIUM">Medium priority</option>
                      <option value="HIGH">High priority</option>
                    </select>
                    <input
                      aria-label="Task due date"
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, dueDate: event.target.value }))
                      }
                    />
                    <WeekdayPicker
                      label="Recurring schedule"
                      value={taskForm.scheduleWeekdays}
                      onChange={(scheduleWeekdays) =>
                        setTaskForm((current) => ({ ...current, scheduleWeekdays }))
                      }
                    />
                    <input
                      aria-label="Task tags"
                      placeholder="Tags, comma separated"
                      value={taskForm.tags}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, tags: event.target.value }))
                      }
                    />
                    <select
                      aria-label="Task project"
                      value={taskForm.projectId}
                      onChange={(event) =>
                        setTaskForm((current) => ({ ...current, projectId: event.target.value }))
                      }
                    >
                      <option value="">No project</option>
                      {projects.filter((project) => project.status === 'ACTIVE').map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={Boolean(pendingAction)}
                    >
                      Add task
                    </button>
                  </div>
                </form>
              </article>}

              {activeScreen === 'goals' && <article className="panel">
                <div className="panel-header">
                  <h3>Active goals</h3>
                  <span className="pill neutral">
                    {goalSummary?.activeGoals.length ?? 0} active
                  </span>
                </div>
                {goalSummary?.activeGoals.length ? (
                  <div className="goal-stack">
                    {goalSummary.activeGoals.map((goal) => (
                      <div key={goal.id} className="goal-item">
                        <div className="goal-topline">
                          <span>{goal.name}</span>
                          <span>{goal.progress}%</span>
                        </div>
                        <div className="progress-bar" aria-label={`${goal.name} progress`}>
                          <span style={{ width: `${goal.progress}%` }} />
                        </div>
                        <div className="goal-meta">
                          <small>{goal.currentValue} / {goal.targetValue}</small>
                          <small>{goal.target}</small>
                        </div>
                        <GoalMilestones token={session.accessToken} goalId={goal.id} />
                        <form
                          className="goal-progress-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            const currentValue = Number(formData.get('currentValue'));
                            if (!Number.isFinite(currentValue) || currentValue < 0) {
                              setError('Goal progress must be zero or greater.');
                              return;
                            }
                            void runAction(`goal-${goal.id}`, async () => {
                              await updateGoalProgress(
                                session.accessToken,
                                goal.id,
                                currentValue,
                              );
                            });
                          }}
                        >
                          <input
                            aria-label={`${goal.name} progress`}
                            name="currentValue"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={goal.currentValue}
                          />
                          <button
                            type="submit"
                            className="inline-button"
                            disabled={Boolean(pendingAction)}
                          >
                            Update
                          </button>
                          <button
                            type="button"
                            className="inline-button danger-button"
                            disabled={Boolean(pendingAction)}
                            onClick={() =>
                              void runAction(`archive-goal-${goal.id}`, async () => {
                                await archiveGoal(session.accessToken, goal.id);
                              })
                            }
                          >
                            Archive
                          </button>
                        </form>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No active goals yet. Add one below.</p>
                )}
                <form
                  className="data-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const targetValue = Number(goalForm.targetValue);
                    if (!goalForm.name.trim() || !targetValue || targetValue < 0) {
                      setError('Enter a goal name and a target greater than zero.');
                      return;
                    }
                    void runAction('create-goal', async () => {
                      await createGoal(session.accessToken, {
                        name: goalForm.name.trim(),
                        targetValue,
                      });
                      setGoalForm({ name: '', targetValue: '' });
                    });
                  }}
                >
                  <h4>Add a goal</h4>
                  <div className="form-fields">
                    <input
                      aria-label="Goal name"
                      placeholder="Goal name"
                      value={goalForm.name}
                      onChange={(event) =>
                        setGoalForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                    <input
                      aria-label="Goal target"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Target"
                      value={goalForm.targetValue}
                      onChange={(event) =>
                        setGoalForm((current) => ({
                          ...current,
                          targetValue: event.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={Boolean(pendingAction)}
                    >
                      Add goal
                    </button>
                  </div>
                </form>
              </article>}
              {activeScreen === 'wealth' && <FinancePlanningScreen token={session.accessToken} />}
            </section>

            <section className="content-grid screen-grid">
              {activeScreen === 'routines' && <article className="panel">
                <div className="panel-header">
                  <h3>Recurring routines</h3>
                  <span className="pill success">
                    {routines.filter((routine) => routine.completed).length}/{routines.length} complete today
                  </span>
                </div>
                {routines.length ? (
                  <ul className="task-list">
                    {routines.map((routine) => (
                      <li key={routine.id} className={routine.completed ? 'done' : ''}>
                        {editingRoutineId === routine.id ? (
                          <form className="task-edit-form" onSubmit={(event) => {
                            event.preventDefault();
                            const points = Number(routineEditForm.points);
                            if (!routineEditForm.title.trim() || !routineEditForm.category.trim() || !points || !routineEditForm.weekdays.length) {
                              setError('Enter a routine name, category, positive XP, and at least one scheduled day.');
                              return;
                            }
                            void runAction(`edit-routine-${routine.id}`, async () => {
                              await updateRoutine(session.accessToken, routine.id, {
                                title: routineEditForm.title.trim(),
                                category: routineEditForm.category.trim(),
                                points,
                                weekdays: routineEditForm.weekdays,
                              });
                              setEditingRoutineId(null);
                            });
                          }}>
                            <input aria-label={`${routine.title} name`} value={routineEditForm.title} onChange={(event) => setRoutineEditForm((current) => ({ ...current, title: event.target.value }))} required />
                            <input aria-label={`${routine.title} category`} value={routineEditForm.category} onChange={(event) => setRoutineEditForm((current) => ({ ...current, category: event.target.value }))} required />
                            <input aria-label={`${routine.title} XP`} type="number" min="1" max="1000" value={routineEditForm.points} onChange={(event) => setRoutineEditForm((current) => ({ ...current, points: event.target.value }))} required />
                            <WeekdayPicker label="Schedule" value={routineEditForm.weekdays} onChange={(weekdays) => setRoutineEditForm((current) => ({ ...current, weekdays }))} />
                            <button type="submit" className="inline-button" disabled={Boolean(pendingAction)}>Save</button>
                            <button type="button" className="inline-button" onClick={() => setEditingRoutineId(null)}>Cancel</button>
                          </form>
                        ) : (
                          <>
                            <span className="checkmark">{routine.completed ? '✓' : '○'}</span>
                            <span className="task-detail">
                              <strong>{routine.title}</strong>
                              <small>{routine.category} · {routine.weekdays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}</small>
                            </span>
                            <span className="points">+{routine.points} XP</span>
                            <button
                              type="button"
                              className="inline-button"
                              disabled={routine.completed || Boolean(pendingAction)}
                              onClick={() =>
                                void runAction(`routine-${routine.id}`, async () => {
                                  await checkInRoutine(session.accessToken, routine.id);
                                })
                              }
                            >
                              {routine.completed ? 'Done' : 'Check in'}
                            </button>
                            <button type="button" className="inline-button" disabled={Boolean(pendingAction)} onClick={() => {
                              setEditingRoutineId(routine.id);
                              setRoutineEditForm({
                                title: routine.title,
                                category: routine.category,
                                points: String(routine.points),
                                weekdays: routine.weekdays,
                              });
                            }}>Edit</button>
                          </>
                        )}
                        <button
                          type="button"
                          className="inline-button danger-button"
                          disabled={Boolean(pendingAction) || editingRoutineId === routine.id}
                          aria-label={`Archive ${routine.title}`}
                          onClick={() =>
                            void runAction(`archive-routine-${routine.id}`, async () => {
                              await archiveRoutine(session.accessToken, routine.id);
                            })
                          }
                        >
                          Archive
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No routines scheduled for today.</p>
                )}
                <form
                  className="data-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const points = Number(routineForm.points);
                    if (
                      !routineForm.title.trim() ||
                      !routineForm.category.trim() ||
                      !points ||
                      routineForm.weekdays.length === 0
                    ) {
                      setError('Add a routine name, category, XP, and at least one scheduled day.');
                      return;
                    }
                    void runAction('create-routine', async () => {
                      await createRoutine(session.accessToken, {
                        title: routineForm.title.trim(),
                        category: routineForm.category.trim(),
                        points,
                        weekdays: routineForm.weekdays,
                      });
                      setRoutineForm({
                        title: '',
                        category: '',
                        points: '',
                        weekdays: [1, 2, 3, 4, 5],
                      });
                    });
                  }}
                >
                  <h4>Add a routine</h4>
                  <div className="form-fields">
                    <input
                      aria-label="Routine name"
                      placeholder="Routine name"
                      value={routineForm.title}
                      onChange={(event) =>
                        setRoutineForm((current) => ({ ...current, title: event.target.value }))
                      }
                      required
                    />
                    <input
                      aria-label="Routine category"
                      placeholder="Category"
                      value={routineForm.category}
                      onChange={(event) =>
                        setRoutineForm((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                      required
                    />
                    <input
                      aria-label="Routine XP points"
                      type="number"
                      min="1"
                      max="1000"
                      placeholder="XP"
                      value={routineForm.points}
                      onChange={(event) =>
                        setRoutineForm((current) => ({ ...current, points: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="weekday-picker" aria-label="Routine schedule">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={routineForm.weekdays.includes(index)}
                          onChange={(event) =>
                            setRoutineForm((current) => ({
                              ...current,
                              weekdays: event.target.checked
                                ? [...current.weekdays, index].sort((a, b) => a - b)
                                : current.weekdays.filter((weekday) => weekday !== index),
                            }))
                          }
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={Boolean(pendingAction)}
                  >
                    Add routine
                  </button>
                </form>
              </article>}

              {activeScreen === 'reflection' && <article className="panel">
                <div className="panel-header">
                  <h3>Daily reflection</h3>
                  <span className="pill neutral">
                    {todayReview ? 'Saved today' : 'Not saved'}
                  </span>
                </div>
                <form
                  className="reflection-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void runAction('save-review', async () => {
                      await saveTodayReview(session.accessToken, {
                        mood: reviewForm.mood ? Number(reviewForm.mood) : null,
                        energy: reviewForm.energy ? Number(reviewForm.energy) : null,
                        wins: reviewForm.wins.trim(),
                        improvements: reviewForm.improvements.trim(),
                        notes: reviewForm.notes.trim(),
                      });
                    });
                  }}
                >
                  <div className="reflection-selects">
                    <label>
                      Mood
                      <select
                        value={reviewForm.mood}
                        onChange={(event) =>
                          setReviewForm((current) => ({ ...current, mood: event.target.value }))
                        }
                      >
                        <option value="">Not set</option>
                        <option value="1">1 — Very low</option>
                        <option value="2">2 — Low</option>
                        <option value="3">3 — Okay</option>
                        <option value="4">4 — Good</option>
                        <option value="5">5 — Great</option>
                      </select>
                    </label>
                    <label>
                      Energy
                      <select
                        value={reviewForm.energy}
                        onChange={(event) =>
                          setReviewForm((current) => ({ ...current, energy: event.target.value }))
                        }
                      >
                        <option value="">Not set</option>
                        <option value="1">1 — Very low</option>
                        <option value="2">2 — Low</option>
                        <option value="3">3 — Okay</option>
                        <option value="4">4 — Good</option>
                        <option value="5">5 — High</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Wins
                    <textarea
                      maxLength={2000}
                      value={reviewForm.wins}
                      onChange={(event) =>
                        setReviewForm((current) => ({ ...current, wins: event.target.value }))
                      }
                      placeholder="What went well today?"
                    />
                  </label>
                  <label>
                    Improve tomorrow
                    <textarea
                      maxLength={2000}
                      value={reviewForm.improvements}
                      onChange={(event) =>
                        setReviewForm((current) => ({
                          ...current,
                          improvements: event.target.value,
                        }))
                      }
                      placeholder="What would you change?"
                    />
                  </label>
                  <label>
                    Notes
                    <textarea
                      maxLength={5000}
                      value={reviewForm.notes}
                      onChange={(event) =>
                        setReviewForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Anything else to capture?"
                    />
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={Boolean(pendingAction)}
                  >
                    Save reflection
                  </button>
                </form>
                {reviewHistory.length > 0 && (
                  <details className="review-history">
                    <summary>Recent reflections ({reviewHistory.length})</summary>
                    <div className="review-history-list">
                      {reviewHistory.map((review) => (
                        <article key={review.date}>
                          <strong>{review.date}</strong>
                          <small>
                            Mood {review.mood ?? '—'} · Energy {review.energy ?? '—'}
                          </small>
                          {review.wins && <p><b>Win:</b> {review.wins}</p>}
                          {review.improvements && (
                            <p><b>Improve:</b> {review.improvements}</p>
                          )}
                          {review.notes && <p>{review.notes}</p>}
                        </article>
                      ))}
                    </div>
                  </details>
                )}
              </article>}
            </section>

            <section className="content-grid screen-grid">
              {activeScreen === 'projects' && <article className="panel">
                <div className="panel-header">
                  <h3>Projects</h3>
                  <span className="pill neutral">{projects.length} tracked</span>
                </div>
                {projects.length ? (
                  <div className="project-list">
                    {projects.map((project) => (
                      <div className="project-item" key={project.id}>
                        <div className="goal-topline">
                          <strong>{project.name}</strong>
                          <span className="pill neutral">{project.status.toLowerCase()}</span>
                        </div>
                        {project.description && <p>{project.description}</p>}
                        <div className="progress-bar" aria-label={`${project.name} progress`}>
                          <span style={{ width: `${project.progress}%` }} />
                        </div>
                        <div className="goal-meta">
                          <small>{project.progress}% complete</small>
                          <small>{project.dueDate ? `Due ${project.dueDate}` : 'No due date'}</small>
                        </div>
                        {project.status !== 'COMPLETED' && (
                          <form
                            className="project-progress-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const value = Number(
                                new FormData(event.currentTarget).get('progress'),
                              );
                              void runAction(`project-${project.id}`, async () => {
                                await updateProject(session.accessToken, project.id, {
                                  progress: value,
                                });
                              });
                            }}
                          >
                            <input
                              aria-label={`${project.name} completion percentage`}
                              type="range"
                              name="progress"
                              min="0"
                              max="100"
                              defaultValue={project.progress}
                            />
                            <button
                              type="submit"
                              className="inline-button"
                              disabled={Boolean(pendingAction)}
                            >
                              Save progress
                            </button>
                            <button
                              type="button"
                              className="inline-button danger-button"
                              disabled={Boolean(pendingAction)}
                              aria-label={`Archive ${project.name}`}
                              onClick={() =>
                                void runAction(`archive-project-${project.id}`, async () => {
                                  await archiveProject(session.accessToken, project.id);
                                })
                              }
                            >
                              Archive
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">No projects yet. Add a project to track progress.</p>
                )}
                <form
                  className="data-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!projectForm.name.trim()) {
                      setError('Enter a project name.');
                      return;
                    }
                    void runAction('create-project', async () => {
                      await createProject(session.accessToken, {
                        name: projectForm.name.trim(),
                        description: projectForm.description.trim(),
                        dueDate: projectForm.dueDate || null,
                      });
                      setProjectForm({ name: '', description: '', dueDate: '' });
                    });
                  }}
                >
                  <h4>Add a project</h4>
                  <div className="form-fields">
                    <input
                      aria-label="Project name"
                      placeholder="Project name"
                      value={projectForm.name}
                      onChange={(event) =>
                        setProjectForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                    <input
                      aria-label="Project description"
                      placeholder="Short description"
                      value={projectForm.description}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                    <input
                      aria-label="Project due date"
                      type="date"
                      value={projectForm.dueDate}
                      onChange={(event) =>
                        setProjectForm((current) => ({
                          ...current,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={Boolean(pendingAction)}
                    >
                      Add project
                    </button>
                  </div>
                </form>
              </article>}

              {activeScreen === 'wealth' && <article className="panel">
                <div className="panel-header">
                  <h3>Finances</h3>
                  <span className="pill neutral">Balances by currency</span>
                </div>
                {finance?.totals.length ? (
                  <div className="finance-totals">
                    {finance.totals.map((total) => (
                      <div className="finance-total" key={total.currency}>
                        <span>Net worth · {total.currency}</span>
                        <strong>
                          {new Intl.NumberFormat(undefined, {
                            style: 'currency',
                            currency: total.currency,
                          }).format(total.netWorth)}
                        </strong>
                        <small>
                          Assets {total.assets.toLocaleString()} · Liabilities {total.liabilities.toLocaleString()}
                        </small>
                        <small>
                          Monthly net change {total.monthlyNetChange > 0 ? '+' : ''}
                          {total.monthlyNetChange.toLocaleString()} {total.currency}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">
                    No accounts yet. Add an asset or liability account to track net worth.
                  </p>
                )}
                {finance?.accounts.map((account) => {
                  const entryForm = entryForms[account.id] ?? {
                    description: '',
                    amount: '',
                    direction: 'INCREASE' as const,
                  };
                  return (
                    <div className="account-item" key={account.id}>
                      <div className="goal-topline">
                        <span>
                          {account.name} <small>({account.kind.toLowerCase()})</small>
                        </span>
                        <strong>
                          {new Intl.NumberFormat(undefined, {
                            style: 'currency',
                            currency: account.currency,
                          }).format(account.balance)}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="inline-button danger-button account-archive"
                        disabled={Boolean(pendingAction)}
                        aria-label={`Archive ${account.name}`}
                        onClick={() =>
                          void runAction(`archive-account-${account.id}`, async () => {
                            await archiveFinancialAccount(session.accessToken, account.id);
                          })
                        }
                      >
                        Archive account
                      </button>
                      {account.entries.length > 0 && (
                        <ul className="entry-history">
                          {account.entries.map((entry) => (
                            <li key={entry.id}>
                              <span>{entry.description}</span>
                              <small>{entry.entryDate}</small>
                              <strong className={entry.direction === 'INCREASE' ? 'positive' : 'warning'}>
                                {entry.direction === 'INCREASE' ? '+' : '-'}
                                {Number(entry.amount).toLocaleString()} {account.currency}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form
                        className="finance-entry-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const amount = Number(entryForm.amount);
                          if (!entryForm.description.trim() || !amount || amount <= 0) {
                            setError('Enter a transaction description and positive amount.');
                            return;
                          }
                          void runAction(`entry-${account.id}`, async () => {
                            await createFinancialEntry(
                              session.accessToken,
                              account.id,
                              {
                                description: entryForm.description.trim(),
                                amount,
                                direction: entryForm.direction,
                              },
                            );
                            setEntryForms((current) => ({
                              ...current,
                              [account.id]: {
                                description: '',
                                amount: '',
                                direction: 'INCREASE',
                              },
                            }));
                          });
                        }}
                      >
                        <input
                          aria-label={`${account.name} transaction description`}
                          placeholder="Transaction"
                          value={entryForm.description}
                          onChange={(event) =>
                            setEntryForms((current) => ({
                              ...current,
                              [account.id]: { ...entryForm, description: event.target.value },
                            }))
                          }
                          required
                        />
                        <input
                          aria-label={`${account.name} transaction amount`}
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          value={entryForm.amount}
                          onChange={(event) =>
                            setEntryForms((current) => ({
                              ...current,
                              [account.id]: { ...entryForm, amount: event.target.value },
                            }))
                          }
                          required
                        />
                        <select
                          aria-label={`${account.name} balance adjustment`}
                          value={entryForm.direction}
                          onChange={(event) =>
                            setEntryForms((current) => ({
                              ...current,
                              [account.id]: {
                                ...entryForm,
                                direction:
                                  event.target.value === 'DECREASE'
                                    ? 'DECREASE'
                                    : 'INCREASE',
                              },
                            }))
                          }
                        >
                          <option value="INCREASE">Increase balance</option>
                          <option value="DECREASE">Decrease balance</option>
                        </select>
                        <button
                          type="submit"
                          className="inline-button"
                          disabled={Boolean(pendingAction)}
                        >
                          Add entry
                        </button>
                      </form>
                    </div>
                  );
                })}
                <form
                  className="data-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const openingBalance = Number(accountForm.openingBalance);
                    if (
                      !accountForm.name.trim() ||
                      !Number.isFinite(openingBalance) ||
                      openingBalance < 0 ||
                      !/^[A-Za-z]{3}$/.test(accountForm.currency)
                    ) {
                      setError('Enter an account name, valid currency code, and non-negative balance.');
                      return;
                    }
                    void runAction('create-account', async () => {
                      await createFinancialAccount(session.accessToken, {
                        ...accountForm,
                        openingBalance,
                      });
                      setAccountForm({
                        name: '',
                        kind: 'ASSET',
                        currency: 'USD',
                        openingBalance: '',
                      });
                    });
                  }}
                >
                  <h4>Add an account</h4>
                  <div className="form-fields">
                    <input
                      aria-label="Account name"
                      placeholder="Account name"
                      value={accountForm.name}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                    <select
                      aria-label="Account kind"
                      value={accountForm.kind}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          kind:
                            event.target.value === 'LIABILITY'
                              ? 'LIABILITY'
                              : 'ASSET',
                        }))
                      }
                    >
                      <option value="ASSET">Asset</option>
                      <option value="LIABILITY">Liability</option>
                    </select>
                    <input
                      aria-label="Currency code"
                      maxLength={3}
                      placeholder="USD"
                      value={accountForm.currency}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          currency: event.target.value.toUpperCase(),
                        }))
                      }
                      required
                    />
                    <input
                      aria-label="Opening balance"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Opening balance"
                      value={accountForm.openingBalance}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          openingBalance: event.target.value,
                        }))
                      }
                      required
                    />
                    <button
                      type="submit"
                      className="secondary-button"
                      disabled={Boolean(pendingAction)}
                    >
                      Add account
                    </button>
                  </div>
                </form>
              </article>}
            </section>

            {activeScreen === 'analytics' && <>
            <section className="bottom-grid">
              <article className="panel">
                <div className="panel-header">
                  <h3>Score summary</h3>
                </div>
                <div className="rhythm-grid">
                  <div>
                    <span>Score this year</span>
                    <strong>{goalSummary?.annualScore.toLocaleString() ?? 0}</strong>
                  </div>
                  <div>
                    <span>Score this month</span>
                    <strong>{goalSummary?.monthlyScore.toLocaleString() ?? 0}</strong>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <h3>Daily score history</h3>
                  <span className="pill neutral">Last 7 days</span>
                </div>
                <div className="score-history">
                  {(scoreSummary?.history ?? [])
                    .slice(0, 7)
                    .reverse()
                    .map((day) => (
                      <div className="score-day" key={day.date}>
                        <span>
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString(
                            undefined,
                            { month: 'short', day: 'numeric' },
                          )}
                        </span>
                        <div
                          className="score-bar"
                          role="progressbar"
                          aria-label={`Score on ${day.date}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={day.score}
                        >
                          <span style={{ width: `${day.score}%` }} />
                        </div>
                        <strong>{day.score}%</strong>
                      </div>
                    ))}
                </div>
              </article>
            </section>

            <section className="content-grid analytics-grid">
              <article className="panel">
                <div className="panel-header">
                  <h3>Performance analysis</h3>
                  <span className="pill neutral">Last {analytics?.periodDays ?? 30} days</span>
                </div>
                <div className="rhythm-grid">
                  <div>
                    <span>Average score</span>
                    <strong>
                      {analytics?.averageDailyScore === null ||
                      analytics?.averageDailyScore === undefined
                        ? '—'
                        : `${analytics.averageDailyScore}%`}
                    </strong>
                  </div>
                  <div>
                    <span>Scored days</span>
                    <strong>{analytics?.activeDays ?? 0}</strong>
                  </div>
                  <div>
                    <span>Previous period</span>
                    <strong>
                      {analytics?.previousAverageDailyScore === null ||
                      analytics?.previousAverageDailyScore === undefined
                        ? '—'
                        : `${analytics.previousAverageDailyScore}%`}
                    </strong>
                  </div>
                  <div>
                    <span>Change</span>
                    <strong>
                      {analytics?.scoreChange === null ||
                      analytics?.scoreChange === undefined
                        ? '—'
                        : `${analytics.scoreChange > 0 ? '+' : ''}${analytics.scoreChange} pts`}
                    </strong>
                  </div>
                </div>
                {analytics?.bestDay && (
                  <p className="muted analytics-best-day">
                    Best day: {analytics.bestDay.date} ({analytics.bestDay.score}%)
                  </p>
                )}
                {analytics?.insights.length ? (
                  <ul className="insight-list">
                    {analytics.insights.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">Your insights will appear after data loads.</p>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <h3>Category performance</h3>
                  <span className="pill neutral">Last 30 days</span>
                </div>
                {analytics?.categoryPerformance.length ? (
                  <div className="category-list">
                    {analytics.categoryPerformance.map((category) => (
                      <div className="category-item" key={category.category}>
                        <div className="goal-topline">
                          <span>{category.category}</span>
                          <strong>{category.score}% score</strong>
                        </div>
                        <div
                          className="progress-bar"
                          aria-label={`${category.category} score`}
                        >
                          <span style={{ width: `${category.score}%` }} />
                        </div>
                        <div className="goal-meta">
                          <small>
                            {category.tasksCompleted} of {category.tasksTotal} task-days complete
                          </small>
                          <small>{category.pointsEarned} / {category.pointsPossible} XP</small>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state">
                    Category analysis will appear when you add tasks.
                  </p>
                )}
              </article>
            </section>
            <ScorePlanningScreen token={session.accessToken} />
            </>}
            {activeScreen === 'chat' && <ChatPanel accessToken={session.accessToken} currentUserId={session.user.id} />}
            {activeScreen === 'archive' && <ArchiveScreen token={session.accessToken} />}
            {activeScreen === 'study' && <StudyWellnessScreen mode="study" accessToken={session.accessToken} projects={projects} />}
            {activeScreen === 'wellness' && <StudyWellnessScreen mode="wellness" accessToken={session.accessToken} projects={projects} />}
            {isPlatformScreen(activeScreen)
              && !(activeScreen === 'admin' && session.user.role !== 'ADMIN') && (
              <PlatformScreen
                key={activeScreen}
                mode={activeScreen}
                token={session.accessToken}
                role={session.user.role}
                userId={session.user.id}
                userName={session.user.name}
                userUsername={session.user.username}
                onProfileSaved={(profile) => {
                  setSession((current) => {
                    if (!current) return current;
                    const updated = { ...current, user: { ...current.user, ...profile } };
                    saveSession(updated);
                    return updated;
                  });
                }}
              />
            )}
            {activeScreen === 'help' && <HelpScreen onNavigate={navigateTo} />}
          </>
        ) : (
          <section className="panel loading-panel">
            <p>Your account data is unavailable.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void loadData(session.accessToken, session.refreshToken)}
            >
              Retry
            </button>
          </section>
        )}
      </main>
      </div>
    </div>
  );
}

export default App;
