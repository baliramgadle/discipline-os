import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { API_BASE_URL } from '../services/apiOrigin';

type Mode = 'leaderboard' | 'notifications' | 'profile' | 'admin';
type Props = {
  mode: Mode;
  token: string;
  role: 'USER' | 'ADMIN';
  userId: string;
  userName: string;
  userUsername: string;
  onProfileSaved: (profile: { name: string; username: string; email: string }) => void;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message: string };
};

type LeaderboardEntry = { rank: number; userId: string; name: string; pointsEarned: number; activeDays: number };
type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
};
type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
};

const request = async <T,>(token: string, path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include', headers });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || !('data' in result)) {
    throw new Error(result.error?.message ?? 'The request failed.');
  }
  return result.data as T;
};

const titles: Record<Mode, string> = {
  leaderboard: 'Leaderboard',
  notifications: 'Notifications',
  profile: 'Profile',
  admin: 'Administration',
};

export function PlatformScreen({ mode, token, role, userId, userName, userUsername, onProfileSaved }: Props) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileName, setProfileName] = useState(userName);
  const [profileUsername, setProfileUsername] = useState(userUsername);
  const [profileEmail, setProfileEmail] = useState('');
  const [savedProfileEmail, setSavedProfileEmail] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('UTC');
  const [emailVerified, setEmailVerified] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminStats, setAdminStats] = useState<Record<string, number>>({});
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    action: string;
    actorName: string | null;
    targetName: string | null;
    createdAt: string;
  }>>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    if (mode === 'leaderboard') {
      const [result, preferences] = await Promise.all([
        request<{ entries: LeaderboardEntry[] }>(token, `/leaderboard?period=${period}`),
        request<{ leaderboardVisible: boolean }>(token, '/leaderboard/preferences'),
      ]);
      setLeaderboard(result.entries);
      setLeaderboardVisible(preferences.leaderboardVisible);
    } else if (mode === 'notifications') {
      const [items, preferences] = await Promise.all([
        request<Notification[]>(token, '/notifications?limit=50'),
        request<{ inAppEnabled: boolean }>(token, '/notifications/preferences'),
      ]);
      setNotifications(items);
      setNotificationsEnabled(preferences.inAppEnabled);
    } else if (mode === 'profile') {
      const profile = await request<{ name: string; username: string; email: string; bio: string; timezone: string; emailVerified: boolean }>(token, '/profile');
      setProfileName(profile.name);
      setProfileUsername(profile.username);
      setProfileEmail(profile.email);
      setSavedProfileEmail(profile.email);
      setProfileBio(profile.bio);
      setProfileTimezone(profile.timezone);
      setEmailVerified(profile.emailVerified);
    } else if (mode === 'admin') {
      const [stats, userList, logs] = await Promise.all([
        request<Record<string, number>>(token, '/admin/stats'),
        request<AdminUser[]>(token, `/admin/users?search=${encodeURIComponent(userSearch)}&limit=50`),
        request<typeof auditLogs>(token, '/admin/audit-logs?limit=30'),
      ]);
      setAdminStats(stats);
      setUsers(userList);
      setAuditLogs(logs);
    }
  }, [mode, period, token, userSearch]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => load()).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : `Could not load ${titles[mode].toLowerCase()}.`);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load, mode]);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The change could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const emailChanged = profileEmail.trim().toLowerCase() !== savedProfileEmail;
      const profile = await request<{
        name: string;
        username: string;
        email: string;
        bio: string;
        timezone: string;
        emailVerified: boolean;
        emailVerificationStatus: string;
      }>(token, '/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profileName.trim(),
          username: profileUsername.trim(),
          email: profileEmail.trim(),
          ...(emailChanged ? { currentPassword: profileCurrentPassword } : {}),
          bio: profileBio.trim(),
          timezone: profileTimezone.trim(),
        }),
      });
      setProfileName(profile.name);
      setProfileUsername(profile.username);
      setProfileEmail(profile.email);
      setSavedProfileEmail(profile.email);
      setProfileBio(profile.bio);
      setProfileTimezone(profile.timezone);
      setEmailVerified(profile.emailVerified);
      setProfileCurrentPassword('');
      onProfileSaved({ name: profile.name, username: profile.username, email: profile.email });
      setNotice(profile.emailVerificationStatus === 'sent'
        ? 'Profile saved. A verification link was sent to your new email address.'
        : profile.emailVerificationStatus === 'delivery-failed'
          ? 'Profile saved, but the verification email could not be delivered. Request another link from Profile.'
          : profile.emailVerificationStatus === 'email-provider-not-configured'
            ? 'Profile saved. Your new email is unverified because email delivery is not configured.'
            : 'Profile saved.');
    });
  };

  return (
    <section className="screen-grid platform-screen">
      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div className="platform-notice" role="status">{notice}</div>}
      {loading ? <article className="panel loading-panel" aria-live="polite">Loading {titles[mode].toLowerCase()}…</article> : null}

      {!loading && mode === 'leaderboard' && (
        <article className="panel">
          <div className="panel-header">
            <div><p className="eyebrow accent">Opt-in community view</p><h3>Leaderboard</h3></div>
            <label className="platform-toggle">
              <input type="checkbox" checked={leaderboardVisible} disabled={saving} onChange={(event) => void run(async () => {
                const result = await request<{ leaderboardVisible: boolean }>(token, '/leaderboard/preferences', {
                  method: 'PUT',
                  body: JSON.stringify({ leaderboardVisible: event.target.checked }),
                });
                setLeaderboardVisible(result.leaderboardVisible);
              })} />
              Show my name
            </label>
          </div>
          <div className="leaderboard-controls" role="group" aria-label="Leaderboard period">
            {(['daily', 'weekly', 'monthly'] as const).map((value) => (
              <button type="button" key={value} className={`toggle ${period === value ? 'active' : ''}`} onClick={() => setPeriod(value)}>
                {value[0]!.toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <p className="muted">Ranks opted-in active users by XP earned from task and routine check-ins in the selected calendar period. You are hidden unless you opt in.</p>
          {leaderboard.length ? (
            <ol className="platform-ranking">
              {leaderboard.map((entry) => (
                <li key={entry.userId}>
                  <span className="rank">{entry.rank}</span><strong>{entry.name}</strong>
                  <span>{entry.pointsEarned.toLocaleString()} XP</span><small>{entry.activeDays} active days</small>
                </li>
              ))}
            </ol>
          ) : <p className="empty-state">No participants have opted in or earned points in this period.</p>}
        </article>
      )}

      {!loading && mode === 'notifications' && (
        <>
          <article className="panel">
            <div className="panel-header">
              <div><p className="eyebrow accent">Stay up to date</p><h3>Notification preferences</h3></div>
              <label className="platform-toggle">
                <input type="checkbox" checked={notificationsEnabled} disabled={saving} onChange={(event) => void run(async () => {
                  const result = await request<{ inAppEnabled: boolean }>(token, '/notifications/preferences', {
                    method: 'PUT',
                    body: JSON.stringify({ inAppEnabled: event.target.checked }),
                  });
                  setNotificationsEnabled(result.inAppEnabled);
                })} />
                In-app notifications
              </label>
            </div>
            <p className="muted">When enabled, incoming messages, due-task reminders, completed goals or milestones, finished projects, and newly earned achievements can appear here. Disabling notifications does not stop chat or task processing.</p>
          </article>
          <article className="panel">
            <div className="panel-header">
              <h3>Recent notifications</h3>
              <button type="button" className="inline-button" disabled={saving || notifications.every((item) => item.readAt)} onClick={() => void run(async () => {
                await request<{ markedRead: number }>(token, '/notifications/read-all', { method: 'POST', body: '{}' });
              })}>Mark all read</button>
            </div>
            {notifications.length ? (
              <div className="module-entry-list">
                {notifications.map((item) => (
                  <article className={`module-entry ${item.readAt ? '' : 'notification-unread'}`} key={item.id}>
                    <div className="goal-topline"><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></div>
                    <p>{item.actorName ? `${item.actorName}: ` : ''}{item.body}</p>
                    {!item.readAt && <button type="button" className="inline-button" disabled={saving} onClick={() => void run(async () => {
                      await request(token, `/notifications/${encodeURIComponent(item.id)}/read`, { method: 'POST', body: '{}' });
                    })}>Mark read</button>}
                  </article>
                ))}
              </div>
            ) : <p className="empty-state">You have no notifications yet.</p>}
          </article>
        </>
      )}

      {!loading && mode === 'profile' && (
        <>
          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow accent">Your account</p><h3>Profile</h3></div></div>
            <dl className="profile-details"><div><dt>Name</dt><dd>{userName}</dd></div><div><dt>Username</dt><dd>@{profileUsername}</dd></div><div><dt>Email</dt><dd>{profileEmail}</dd></div><div><dt>Role</dt><dd>{role}</dd></div></dl>
            <div className="profile-email-status">
              <p>Email verification: <strong>{emailVerified ? 'Verified' : 'Not verified'}</strong></p>
              {!emailVerified && <button type="button" className="inline-button" disabled={saving} onClick={() => void run(async () => {
                const result = await request<{ message: string }>(token, '/auth/email-verification/request', {
                  method: 'POST',
                  body: JSON.stringify({}),
                });
                setNotice(result.message);
              })}>Send verification link</button>}
            </div>
            <form className="data-form" onSubmit={submitProfile}>
              <label htmlFor="profile-name">Display name</label>
              <input id="profile-name" minLength={2} maxLength={80} value={profileName} onChange={(event) => setProfileName(event.target.value)} required />
              <label htmlFor="profile-username">Username for direct messages</label>
              <input id="profile-username" minLength={3} maxLength={50} pattern="[A-Za-z0-9_]+" autoComplete="username" value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} required />
              <label htmlFor="profile-email">Email address</label>
              <input id="profile-email" type="email" autoComplete="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} required />
              {profileEmail.trim().toLowerCase() !== savedProfileEmail && <label htmlFor="profile-current-password">Current password (required to change email)
                <input id="profile-current-password" type="password" autoComplete="current-password" minLength={8} value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} required />
              </label>}
              <label htmlFor="profile-bio">About you</label>
              <textarea id="profile-bio" maxLength={280} rows={3} value={profileBio} onChange={(event) => setProfileBio(event.target.value)} />
              <small>{profileBio.length}/280</small>
              <label htmlFor="profile-timezone">Timezone (IANA)</label>
              <input id="profile-timezone" maxLength={80} placeholder="Asia/Kolkata" value={profileTimezone} onChange={(event) => setProfileTimezone(event.target.value)} required />
              <p className="muted">Timezone examples: Asia/Kolkata, America/New_York, Europe/London.</p>
              <button className="secondary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            </form>
          </article>
          <article className="panel">
            <h3>Account and privacy</h3>
            <p className="muted">Your records are scoped to your account. Your display name appears to other people only in features where it is needed, such as conversations. Leaderboard participation is separately opt-in from the Leaderboard screen.</p>
            <p className="muted">Sign out on shared devices and avoid storing sensitive information in free-text notes or chat.</p>
          </article>
        </>
      )}

      {!loading && mode === 'admin' && role === 'ADMIN' && (
        <>
          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow accent">Restricted tools</p><h3>System overview</h3></div></div>
            <div className="rhythm-grid">
              {Object.entries(adminStats).map(([key, value]) => (
                <div key={key}><span>{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{value.toLocaleString()}</strong></div>
              ))}
            </div>
          </article>
          <article className="panel">
            <div className="panel-header"><h3>User management</h3></div>
            <label className="admin-search">Search users
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Name or email" />
            </label>
            {users.length ? <div className="admin-user-list">
              {users.map((user) => (
                <article className="admin-user" key={user.id}>
                  <div><strong>{user.name}</strong>                  <small>@{user.username} · {user.email} · Joined {new Date(user.createdAt).toLocaleDateString()}</small></div>
                  <div className="admin-user-controls">
                    <label>Role
                      <select value={user.role} disabled={saving} onChange={(event) => void run(async () => {
                        await request(token, `/admin/users/${encodeURIComponent(user.id)}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role: event.target.value }),
                        });
                      })}>
                        <option value="USER">User</option><option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <button type="button" className={`inline-button ${user.isActive ? 'danger-button' : ''}`} disabled={saving || user.id === userId} onClick={() => void run(async () => {
                      await request(token, `/admin/users/${encodeURIComponent(user.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ isActive: !user.isActive }),
                      });
                    })}>{user.isActive ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </article>
              ))}
            </div> : <p className="empty-state">No users match this search.</p>}
            <p className="muted admin-safety-note">The backend prevents removing the last active administrator and disallows self-demotion or self-deactivation.</p>
          </article>
          <article className="panel">
            <div className="panel-header"><h3>Recent audit log</h3></div>
            {auditLogs.length ? <div className="module-entry-list">{auditLogs.map((log) => (
              <article className="module-entry" key={log.id}>
                <div className="goal-topline"><strong>{log.action}</strong><small>{new Date(log.createdAt).toLocaleString()}</small></div>
                <p>{log.actorName ?? 'Unknown actor'} → {log.targetName ?? 'Removed account'}</p>
              </article>
            ))}</div> : <p className="empty-state">Administrative user changes will be recorded here.</p>}
          </article>
        </>
      )}
    </section>
  );
}
