import type {
  AuthResponse,
  AuthUser,
  AnalyticsSummary,
  DailyReview,
  DashboardOverview,
  FinanceSummary,
  Goal,
  GoalSummaryResponse,
  Project,
  ScoreSummary,
  Routine,
  Task,
  StudySession,
  WellnessEntry,
  WellnessSummary,
} from '../types/auth';
import { API_BASE_URL } from './apiOrigin';

const API_PREFIX = API_BASE_URL;

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

  let payload: ApiResult<T>;
  try {
    payload = (await response.json()) as ApiResult<T>;
  } catch {
    throw new ApiError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok || payload.success === false) {
    throw new ApiError(
      payload.error?.message ?? 'The request failed.',
      response.status,
    );
  }
  if (!('data' in payload)) {
    throw new ApiError('The server response did not include data.', response.status);
  }

  return payload.data as T;
}

export const loginUser = (identifier: string, password: string) =>
  apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });

export const registerUser = (name: string, username: string, email: string, password: string) =>
  apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, username, email, password }),
  });

export const refreshSession = (refreshToken: string) =>
  apiRequest<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });

export const requestPasswordReset = (email: string) =>
  apiRequest<{ message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token: string, password: string) =>
  apiRequest<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });

export const confirmEmailVerification = (token: string) =>
  apiRequest<{ message: string }>('/auth/email-verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const fetchDashboardOverview = (token: string) =>
  apiRequest<DashboardOverview>('/dashboard/overview', { method: 'GET' }, token);

export const fetchAnalyticsSummary = (token: string) =>
  apiRequest<AnalyticsSummary>('/analytics/summary', { method: 'GET' }, token);

export const fetchGoalsSummary = (token: string) =>
  apiRequest<GoalSummaryResponse>('/goals/summary', { method: 'GET' }, token);

export const fetchScoreSummary = (token: string, days = 30) =>
  apiRequest<ScoreSummary>(
    `/scores/summary?days=${encodeURIComponent(days)}`,
    { method: 'GET' },
    token,
  );

export const fetchTaskBoard = (token: string) =>
  apiRequest<Task[]>('/tasks/board', { method: 'GET' }, token);

export type ArchivedRecord = {
  kind: 'task' | 'routine' | 'project' | 'goal' | 'financial-account' | 'financial-goal' | 'budget' | 'study-session' | 'wellness-entry';
  id: string;
  title: string;
  detail: string;
  archivedAt: string | null;
};

export const fetchArchivedRecords = (token: string) =>
  apiRequest<ArchivedRecord[]>('/archive', { method: 'GET' }, token);

export const restoreArchivedRecord = (token: string, record: Pick<ArchivedRecord, 'kind' | 'id'>) =>
  apiRequest<{ restored: boolean }>(
    `/archive/${encodeURIComponent(record.kind)}/${encodeURIComponent(record.id)}/restore`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );

export const fetchRoutineBoard = (token: string) =>
  apiRequest<Routine[]>('/routines/board', { method: 'GET' }, token);

export const createRoutine = (
  token: string,
  routine: Pick<Routine, 'title' | 'category' | 'points' | 'weekdays'>,
) =>
  apiRequest<Routine>(
    '/routines',
    { method: 'POST', body: JSON.stringify(routine) },
    token,
  );

export const updateRoutine = (
  token: string,
  routineId: string,
  routine: Partial<Pick<Routine, 'title' | 'category' | 'points' | 'weekdays'>>,
) =>
  apiRequest<Routine>(
    `/routines/${encodeURIComponent(routineId)}`,
    { method: 'PATCH', body: JSON.stringify(routine) },
    token,
  );

export const checkInRoutine = (token: string, routineId: string) =>
  apiRequest<{ routineId: string; date: string; xpAwarded: number }>(
    `/routines/${encodeURIComponent(routineId)}/check-in`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );

export const archiveRoutine = (token: string, routineId: string) =>
  apiRequest<{ archived: boolean }>(
    `/routines/${encodeURIComponent(routineId)}`,
    { method: 'DELETE' },
    token,
  );

export const fetchTodayReview = (token: string) =>
  apiRequest<DailyReview | null>('/reviews/today', { method: 'GET' }, token);

export const fetchReviewHistory = (token: string) =>
  apiRequest<DailyReview[]>('/reviews/history?limit=7', { method: 'GET' }, token);

export const saveTodayReview = (
  token: string,
  review: Pick<DailyReview, 'mood' | 'energy' | 'wins' | 'improvements' | 'notes'>,
) =>
  apiRequest<DailyReview>(
    '/reviews/today',
    { method: 'PUT', body: JSON.stringify(review) },
    token,
  );

export const fetchProjects = (token: string) =>
  apiRequest<Project[]>('/projects', { method: 'GET' }, token);

export const fetchStudySessions = (token: string) =>
  apiRequest<StudySession[]>('/study/sessions?limit=30', { method: 'GET' }, token);

export const fetchStudySummary = (token: string) =>
  apiRequest<{ totalMinutes: number; sessionCount: number; studyDays: number; minutesThisWeek: number }>(
    '/study/summary',
    { method: 'GET' },
    token,
  );

export const createStudySession = (
  token: string,
  session: {
    subject: string;
    topic: string;
    durationMinutes: number;
    notes: string;
    projectId: string | null;
  },
) =>
  apiRequest<StudySession>(
    '/study/sessions',
    { method: 'POST', body: JSON.stringify(session) },
    token,
  );

export const updateStudySession = (
  token: string,
  sessionId: string,
  update: Partial<Pick<StudySession, 'subject' | 'topic' | 'durationMinutes' | 'notes' | 'sessionDate' | 'projectId'>>,
) =>
  apiRequest<StudySession>(
    `/study/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
    token,
  );

export const archiveStudySession = (token: string, sessionId: string) =>
  apiRequest<{ archived: boolean }>(
    `/study/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
    token,
  );

export const fetchTodayWellness = (token: string) =>
  apiRequest<WellnessEntry[]>('/wellness/today', { method: 'GET' }, token);

export const fetchWellnessSummary = (token: string) =>
  apiRequest<WellnessSummary>('/wellness/summary', { method: 'GET' }, token);

export const createWellnessEntry = (
  token: string,
  entry: {
    kind: WellnessEntry['kind'];
    label: string;
    quantity: number | null;
    unit: string;
    notes: string;
  },
) =>
  apiRequest<WellnessEntry>(
    '/wellness',
    { method: 'POST', body: JSON.stringify(entry) },
    token,
  );

export const archiveWellnessEntry = (token: string, entryId: string) =>
  apiRequest<{ archived: boolean }>(
    `/wellness/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' },
    token,
  );

export const updateWellnessEntry = (
  token: string,
  entryId: string,
  update: Partial<Pick<WellnessEntry, 'kind' | 'label' | 'quantity' | 'unit' | 'notes' | 'entryDate'>>,
) =>
  apiRequest<WellnessEntry>(
    `/wellness/${encodeURIComponent(entryId)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
    token,
  );

export const createProject = (
  token: string,
  project: Pick<Project, 'name' | 'description'> & { dueDate?: string | null },
) =>
  apiRequest<Project>(
    '/projects',
    { method: 'POST', body: JSON.stringify(project) },
    token,
  );

export const updateProject = (
  token: string,
  projectId: string,
  update: { progress?: number; status?: 'ACTIVE' | 'COMPLETED' },
) =>
  apiRequest<Project>(
    `/projects/${encodeURIComponent(projectId)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
    token,
  );

export const archiveProject = (token: string, projectId: string) =>
  apiRequest<{ archived: boolean }>(
    `/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
    token,
  );

export const fetchFinanceSummary = (token: string) =>
  apiRequest<FinanceSummary>('/finance/summary', { method: 'GET' }, token);

export const archiveFinancialAccount = (token: string, accountId: string) =>
  apiRequest<{ archived: boolean }>(
    `/finance/accounts/${encodeURIComponent(accountId)}`,
    { method: 'DELETE' },
    token,
  );

export const createFinancialAccount = (
  token: string,
  account: {
    name: string;
    kind: 'ASSET' | 'LIABILITY';
    currency: string;
    openingBalance: number;
  },
) =>
  apiRequest('/finance/accounts', {
    method: 'POST',
    body: JSON.stringify(account),
  }, token);

export const createFinancialEntry = (
  token: string,
  accountId: string,
  entry: {
    description: string;
    amount: number;
    direction: 'INCREASE' | 'DECREASE';
  },
) =>
  apiRequest(
    `/finance/accounts/${encodeURIComponent(accountId)}/entries`,
    { method: 'POST', body: JSON.stringify(entry) },
    token,
  );

export const fetchCurrentUser = (token: string) =>
  apiRequest<{ user: AuthUser }>('/auth/me', { method: 'GET' }, token);

export const logoutUser = (token: string) =>
  apiRequest<{ loggedOut: boolean }>('/auth/logout', { method: 'POST' }, token);

export const createTask = (
  token: string,
  task: Pick<Task, 'title' | 'category' | 'points'> & {
    priority?: Task['priority'];
    dueDate?: string | null;
    description?: string;
    scheduleWeekdays?: number[] | null;
    tags?: string[];
    projectId?: string | null;
  },
) =>
  apiRequest<Task>(
    '/tasks',
    { method: 'POST', body: JSON.stringify(task) },
    token,
  );

export const updateTask = (
  token: string,
  taskId: string,
  update: Partial<Pick<Task, 'title' | 'category' | 'points' | 'description' | 'priority' | 'dueDate' | 'scheduleWeekdays' | 'tags' | 'projectId'>>,
) =>
  apiRequest<Task>(
    `/tasks/${encodeURIComponent(taskId)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
    token,
  );

export const checkInTask = (token: string, taskId: string) =>
  apiRequest<{ taskId: string; date: string; xpAwarded: number }>(
    `/tasks/${encodeURIComponent(taskId)}/check-in`,
    { method: 'POST', body: JSON.stringify({}) },
    token,
  );

export const archiveTask = (token: string, taskId: string) =>
  apiRequest<{ archived: boolean }>(
    `/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
    token,
  );

export const createGoal = (
  token: string,
  goal: Pick<Goal, 'name' | 'targetValue'> & { targetDescription?: string },
) =>
  apiRequest<Goal>(
    '/goals',
    { method: 'POST', body: JSON.stringify(goal) },
    token,
  );

export const updateGoalProgress = (
  token: string,
  goalId: string,
  currentValue: number,
) =>
  apiRequest<Goal>(
    `/goals/${encodeURIComponent(goalId)}`,
    { method: 'PATCH', body: JSON.stringify({ currentValue }) },
    token,
  );

export const archiveGoal = (token: string, goalId: string) =>
  apiRequest<{ archived: boolean }>(
    `/goals/${encodeURIComponent(goalId)}`,
    { method: 'DELETE' },
    token,
  );
