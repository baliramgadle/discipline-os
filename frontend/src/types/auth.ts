export type UserRole = 'USER' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  username: string;
  role: UserRole;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export type AuthResponse = {
  user: AuthUser;
  tokens: AuthTokens;
  emailVerificationStatus?: 'sent' | 'delivery-failed' | 'email-provider-not-configured';
};

export type DashboardOverview = {
  headline: string;
  user: Pick<AuthUser, 'name' | 'role'>;
  metrics: Array<{
    label: string;
    value: string;
    change: string;
    tone: 'positive' | 'neutral' | 'warning';
  }>;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  points: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate: string | null;
  scheduleWeekdays: number[] | null;
  tags: string[];
  projectId: string | null;
  projectName: string | null;
  completed: boolean;
};

export type Routine = {
  id: string;
  title: string;
  category: string;
  points: number;
  weekdays: number[];
  completed: boolean;
};

export type DailyReview = {
  date: string;
  mood: number | null;
  energy: number | null;
  wins: string;
  improvements: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  progress: number;
  dueDate: string | null;
};

export type StudySession = {
  id: string;
  subject: string;
  topic: string;
  durationMinutes: number;
  notes: string;
  sessionDate: string;
  projectId: string | null;
  projectName?: string | null;
  createdAt: string;
};

export type WellnessKind = 'MEAL' | 'WATER' | 'WORKOUT' | 'SLEEP' | 'HABIT';

export type WellnessEntry = {
  id: string;
  kind: WellnessKind;
  label: string;
  quantity: number | null;
  unit: string;
  notes: string;
  entryDate: string;
  createdAt: string;
};

export type WellnessSummary = {
  last30Days: Array<{
    kind: WellnessKind;
    entryCount: number;
    totalQuantity: number;
    unit: string;
  }>;
  recentDays: Array<{ date: string; entryCount: number }>;
};

export type FinanceSummary = {
  totals: Array<{
    currency: string;
    assets: number;
    liabilities: number;
    netWorth: number;
    monthlyNetChange: number;
  }>;
  accounts: Array<{
    id: string;
    name: string;
    kind: 'ASSET' | 'LIABILITY';
    currency: string;
    balance: number;
    monthlyNetChange: number;
    entries: Array<{
      id: string;
      description: string;
      amount: string;
      direction: 'INCREASE' | 'DECREASE';
      entryDate: string;
    }>;
  }>;
};

export type Goal = {
  id: string;
  name: string;
  targetValue: number;
  currentValue: number;
  targetDescription: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  progress: number;
  target: string;
};

export type GoalSummaryResponse = {
  annualScore: number;
  monthlyScore: number;
  activeGoals: Goal[];
};

export type DailyScore = {
  date: string;
  score: number;
  tasksCompleted: number;
  tasksTotal: number;
  pointsEarned: number;
  pointsPossible: number;
};

export type ScoreSummary = {
  today: DailyScore;
  currentStreakDays: number;
  bestStreakDays: number;
  history: DailyScore[];
};

export type AnalyticsSummary = {
  periodDays: number;
  activeDays: number;
  averageDailyScore: number | null;
  previousAverageDailyScore: number | null;
  scoreChange: number | null;
  bestDay: DailyScore | null;
  categoryPerformance: Array<{
    category: string;
    tasksTotal: number;
    tasksCompleted: number;
    completionRate: number;
    pointsEarned: number;
    pointsPossible: number;
    score: number;
  }>;
  insights: string[];
};
