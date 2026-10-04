import './HelpScreen.css';

type HelpDestination =
  | 'dashboard'
  | 'tasks'
  | 'archive'
  | 'goals'
  | 'routines'
  | 'reflection'
  | 'projects'
  | 'wealth'
  | 'study'
  | 'wellness'
  | 'leaderboard'
  | 'notifications'
  | 'profile'
  | 'admin'
  | 'analytics'
  | 'chat';

type Props = { onNavigate: (screen: HelpDestination) => void };

const sections = [
  ['getting-started', 'Getting started'],
  ['dashboard', 'Dashboard'],
  ['tasks', 'Tasks'],
  ['archive', 'Archive and restore'],
  ['goals', 'Goals'],
  ['routines', 'Recurring routines'],
  ['reflection', 'Daily reflection'],
  ['projects', 'Projects'],
  ['study', 'Study tracker'],
  ['wellness', 'Wellness'],
  ['wealth', 'Wealth tracker'],
  ['leaderboard', 'Leaderboard'],
  ['notifications', 'Notifications'],
  ['profile', 'Profile'],
  ['admin', 'Admin'],
  ['analytics', 'Scores and analytics'],
  ['chat', 'Real-time chat'],
  ['privacy', 'Account, privacy, and safe use'],
  ['terms', 'Terms and definitions'],
] as const;

export function HelpScreen({ onNavigate }: Props) {
  return (
    <div className="help-screen">
      <section className="help-intro panel">
        <p className="eyebrow accent">Discipline OS field guide</p>
        <h2>Make the system work for your life.</h2>
        <p className="muted">
          This guide explains each available screen, how to use its controls, what
          the numbers mean, and what is not yet part of the current app.
        </p>
        <div className="help-callout">
          Discipline OS is a reflection and planning aid—not a medical, financial,
          or mental-health service. Use the parts that help; skip or adapt anything
          that creates unnecessary pressure.
        </div>
      </section>

      <section className="help-section panel" id="guide-archive">
        <h2>Archive and restore</h2>
        <p>
          Archiving hides an item from its active screen without deleting its saved
          history. Open Archive to review and restore tasks, routines, projects,
          goals, financial accounts and plans, study sessions, or wellness entries.
          Restored routines and recurring tasks appear again when their schedule
          matches the current day.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('archive')}>Open Archive</button>
      </section>

      <nav className="help-toc panel" aria-label="Help topics">
        <h3>In this guide</h3>
        <div>
          {sections.map(([id, title]) => <a key={id} href={`#guide-${id}`}>{title}</a>)}
        </div>
      </nav>

      <section className="help-section panel" id="guide-getting-started">
        <h2>Getting started</h2>
        <ol>
          <li>Register with a unique username. People use it to find you for direct messages; your email address stays out of chat search.</li>
          <li>Sign in with either your registered email address or username, followed by your password.</li>
          <li>Use Forgot password on the sign-in form to request a reset link if email delivery has been configured.</li>
          <li>Start small: add a task, a measurable goal, or a routine that fits a normal day.</li>
          <li>Check work in when it is done. Progress and performance summaries update from saved activity.</li>
          <li>Use Reflection to record what happened and Analytics to look for patterns, not to judge a single day.</li>
          <li>Use the left navigation on desktop. On a phone, tap Menu to open the compact module menu, then choose a screen.</li>
        </ol>
        <p>Use <b>Refresh</b> in the page header if you need to reload the latest server data.</p>
      </section>

      <section className="help-section panel" id="guide-dashboard">
        <h2>Dashboard</h2>
        <p>
          Dashboard is the landing overview. It shows the account greeting and current
          server-provided overview metrics. Quick-navigation buttons take you to Tasks,
          Reflection, and Analytics. Use the navigation to open any other module.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('dashboard')}>Open Dashboard</button>
      </section>

      <section className="help-section panel" id="guide-tasks">
        <h2>Tasks</h2>
        <p>
          Tasks are individual pieces of work. The screen lists active tasks and whether
          they have been checked in for today.
        </p>
        <ul>
          <li><b>Add a task:</b> enter its title, category, positive XP value, priority, optional due date, comma-separated tags, and optional active project.</li>
          <li><b>Check in:</b> use the task action to record completion. A completed check-in is saved by the server and cannot be awarded twice for the same day.</li>
          <li><b>Repeat on selected weekdays:</b> choose one or more weekdays. Leave the schedule empty for a task available every day; each scheduled date has its own check-in.</li>
          <li><b>Edit:</b> update a task’s title, category, XP, priority, recurrence, tags, project, or due date using its Edit action.</li>
          <li><b>Archive:</b> removes an item from the active board while retaining its historical contribution where supported. Confirm before archiving.</li>
        </ul>
        <p>
          A task’s XP is its configured point value, not a manually entered score.
          Priority influences list order. A due date is a planning reminder and does
          not automatically archive or complete a task. A project link only selects
          one of your active projects; archiving a project removes the link but does
          not delete the task.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('tasks')}>Open Tasks</button>
      </section>

      <section className="help-section panel" id="guide-goals">
        <h2>Goals</h2>
        <p>
          Goals turn an intention into a measurable target. The list shows current
          progress against each active goal. Break goals into dated, measurable
          milestones and update each milestone’s progress as you complete it.
        </p>
        <ul>
          <li>Enter a name and a target greater than zero to add a goal.</li>
          <li>Use the progress field and Update to save the current measured value.</li>
          <li>Progress is displayed as a percentage of the target; completing or archiving a goal changes its active state.</li>
          <li>Choose a unit or metric you can measure consistently (for example, pages, applications, or workouts); the unit is your description, not automatically inferred.</li>
        </ul>
        <button type="button" className="inline-button" onClick={() => onNavigate('goals')}>Open Goals</button>
      </section>

      <section className="help-section panel" id="guide-routines">
        <h2>Recurring routines</h2>
        <p>
          Routines are repeatable actions assigned to days of the week. Unlike a task,
          the routine definition remains active and can be checked in again on its next
          scheduled day.
        </p>
        <ul>
          <li>Add a name, category, XP value, and at least one weekday.</li>
          <li>Check in when you complete the routine for the current day. The screen shows today’s completion state.</li>
          <li>Use Archive when you no longer want the routine on your active schedule.</li>
          <li>Choose a humane schedule. Missing a day is information for planning—not a personal failure.</li>
        </ul>
        <button type="button" className="inline-button" onClick={() => onNavigate('routines')}>Open Routines</button>
      </section>

      <section className="help-section panel" id="guide-reflection">
        <h2>Daily reflection</h2>
        <p>
          Reflection is a private, account-scoped daily note. Mood and energy ratings
          are optional 1–5 check-ins, followed by Wins, Improve tomorrow, and Notes.
        </p>
        <ul>
          <li>Choose Not set when a rating does not feel useful that day.</li>
          <li>Save reflection to update today’s entry; saving again edits the same day rather than creating a duplicate.</li>
          <li>Open Recent reflections to review the recent saved entries.</li>
          <li>Keep notes respectful of your own privacy, especially on shared or public devices.</li>
        </ul>
        <button type="button" className="inline-button" onClick={() => onNavigate('reflection')}>Open Reflection</button>
      </section>

      <section className="help-section panel" id="guide-projects">
        <h2>Projects</h2>
        <p>
          Projects collect work that needs progress over time. Add a name, optional
          description, and optional due date. Update the percentage slider and save
          progress as work advances. Setting progress to 100% completes the project.
          Archive projects that are no longer active.
        </p>
        <p>
          The current project screen tracks project-level progress. Study sessions
          can optionally be linked to one of your active projects; separate project
          task breakdowns and milestones are not yet available.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('projects')}>Open Projects</button>
      </section>

      <section className="help-section panel" id="guide-study">
        <h2>Study tracker</h2>
        <p>
          Study records are a personal log of time spent learning. Add a subject,
          optional topic, duration in minutes, optional notes, and (if relevant) a
          project you own. The overview summarizes recorded time and session counts
          from the last 90 days; recent sessions show up to 30 records.
        </p>
        <p>
          Study sessions are not automatically converted into task XP or a score.
          Study plans, subject hierarchies, and dedicated study charts are not yet
          available.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('study')}>Open Study</button>
      </section>

      <section className="help-section panel" id="guide-wellness">
        <h2>Wellness tracker</h2>
        <p>
          Use Wellness as a flexible journal for meals, water, workouts, sleep, or
          habits. Select an activity type and add a short label; quantity, unit, and
          notes are optional. The summary groups records from the past 30 days and
          does not grade or diagnose your health.
        </p>
        <p>
          Today’s entries can be deleted individually. The tracker does not provide
          nutrition guidance, medical advice, automatic device imports, or a wellness
          score. If a quantity is not meaningful for an activity, leave it blank.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('wellness')}>Open Wellness</button>
      </section>

      <section className="help-section panel" id="guide-wealth">
        <h2>Wealth tracker</h2>
        <p>
          Wealth provides a basic record of accounts, balances, and dated entries. It
          is not connected to a bank and does not import transactions automatically.
          Add financial goals and monthly category budgets to plan savings and
          spending.
        </p>
        <ul>
          <li>Create an Asset or Liability account, choose its currency, and enter its opening balance.</li>
          <li>Add an entry with a description, amount, and whether it increases or decreases the account balance.</li>
          <li>Review account balances, recent entries, assets, liabilities, net worth, and monthly net change.</li>
          <li>Totals remain separated by currency. The app does not convert or combine different currencies.</li>
          <li>Budget spending is estimated by matching its category text in decrease-entry descriptions for accounts using the same currency.</li>
          <li>Archive an account to remove it from the active summary. Verify amounts and currency before saving; this is a manual tracking tool.</li>
        </ul>
        <div className="help-callout"><b>Net worth</b> = assets − liabilities, calculated separately for each currency.</div>
        <p>Financial goals and budgets are planning aids, not investment advice. Values are entered manually.</p>
        <button type="button" className="inline-button" onClick={() => onNavigate('wealth')}>Open Wealth</button>
      </section>

      <section className="help-section panel" id="guide-analytics">
        <h2>Scores and analytics</h2>
        <p>
          Scores and analytics summarize activity recorded in Tasks and Routines.
          Completion events and configured point values are processed server-side;
          the browser cannot directly set your score.
        </p>
        <ul>
          <li><b>Daily score:</b> a completion measure based on points earned versus points available for eligible tasks and scheduled routines.</li>
          <li><b>Score history:</b> a recent daily view to help spot consistency and changes over time.</li>
          <li><b>Streak:</b> consecutive calendar days with recorded task or routine check-in activity, according to the server’s streak rules.</li>
          <li><b>XP:</b> points awarded by completed activity. XP and score answer different questions: accumulated points versus performance in a period.</li>
          <li><b>Category performance:</b> completed versus available activity, points, and rates grouped by the categories assigned to tasks or routines.</li>
          <li><b>Insights:</b> observations generated from your recorded history; treat them as prompts to investigate rather than instructions.</li>
        </ul>
        <p>
          In Analytics, add up to ten private targets for daily, weekly, or monthly
          XP, active days, or current streak. The same screen tracks persistent
          achievements for check-ins, XP, streaks, and completed projects. Achievement
          unlocks also appear in Notifications when in-app notifications are enabled.
          Leaderboard participation is separate and opt-in.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('analytics')}>Open Analytics</button>
      </section>

      <section className="help-section panel" id="guide-leaderboard">
        <h2>Leaderboard</h2>
        <p>
          Leaderboards compare XP from task and routine check-ins for daily, weekly,
          or monthly calendar periods. Participation is private by default. Turn on
          Show my name to opt in; turn it off to remove yourself from future results.
          Ranks use total XP and then active days as a tie-breaker.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('leaderboard')}>Open Leaderboard</button>
      </section>

      <section className="help-section panel" id="guide-notifications">
        <h2>Notifications</h2>
        <p>
          The in-app feed records incoming chat messages, due-task reminders,
          completed goals and milestones, finished projects, and newly unlocked
          achievements when in-app notifications are enabled. Due-task reminders
          are generated when the feed is loaded, not by a background scheduler.
          Use Mark read for one item or Mark all read for the feed. Disabling
          notifications does not disable message delivery. Push and
          general-purpose email notifications are not provided.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('notifications')}>Open Notifications</button>
      </section>

      <section className="help-section panel" id="guide-profile">
        <h2>Profile</h2>
        <p>
          Profile lets you update your display name, unique username, email address,
          bio, and timezone and review
          your account role and privacy notes. Leaderboard visibility is controlled
          separately on the Leaderboard screen. Password changes use the Forgot
          password flow from the sign-in screen. The profile shows email verification
          status and can request a new verification link. Changing the email requires
          your current password and makes the new address unverified until confirmed.
          Verification and password
          email depend on the configured email provider; delivery is reported rather
          than simulated.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('profile')}>Open Profile</button>
      </section>

      <section className="help-section panel" id="guide-admin">
        <h2>Admin</h2>
        <p>
          Admin is shown only to accounts with the ADMIN role, and the backend
          independently checks that role for every administrative request. It
          provides system activity counts, user search, account activation and role
          updates, and recent audit entries. The backend blocks self-demotion,
          self-deactivation, and removing the last active administrator.
        </p>
        <p>
          Administrative actions affect other people’s accounts. Use them only when
          authorized, make changes carefully, and review the audit history.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('admin')}>Open Admin</button>
      </section>

      <section className="help-section panel" id="guide-chat">
        <h2>Real-time chat</h2>
        <p>
          Chat supports direct and group conversations. Messages are persisted by
          the backend; Socket.IO provides live delivery, online indicators, and typing
          status. A network connection is required for real-time updates.
        </p>
        <ul>
          <li><b>Username:</b> choose a unique handle during registration. It can be updated in Profile and is the only way to find someone for a direct message.</li>
          <li><b>Find people:</b> search active accounts by their unique username; names and email addresses are not searchable.</li>
          <li><b>Direct message:</b> select Direct message next to a username. An existing one-to-one conversation is reused.</li>
          <li><b>Community group:</b> select one or more Add to group checkboxes in the username search results, provide a group name, and create the group. The creator is included automatically.</li>
          <li><b>Send:</b> select a conversation, write a message, and press Send. Message history loads when you open a conversation; Load older fetches earlier messages.</li>
          <li><b>Reply:</b> select Reply on a message, write a response, and send it. The reply retains its parent context.</li>
          <li><b>Edit or delete:</b> you can edit or delete your own messages. Deleted messages show a deletion marker to conversation members.</li>
          <li><b>Sent / Seen:</b> message receipts reflect the conversation’s persisted read position. A recipient’s read action advances that position.</li>
          <li><b>Online / typing:</b> presence and typing indicators are temporary connection states; they are not message history.</li>
        </ul>
        <p>
          Only share information with people you trust. Your username is searchable by active accounts. The current chat has basic
          group membership and sender-owned message controls; reporting, moderation,
          reactions, file attachments, and end-to-end encryption are not provided.
        </p>
        <button type="button" className="inline-button" onClick={() => onNavigate('chat')}>Open Chat</button>
      </section>

      <section className="help-section panel" id="guide-privacy">
        <h2>Account, privacy, and safe use</h2>
        <ul>
          <li>Your account’s records are loaded from the backend and scoped to your signed-in identity.</li>
          <li>Log out on shared devices. Do not share passwords, session tokens, or sensitive financial, health, or personal details in chat.</li>
          <li>Use Refresh to retrieve current server data if another session or browser tab changed a record.</li>
          <li>Archiving is intended to preserve history while hiding an item from active lists. Review the confirmation carefully.</li>
          <li>Discipline OS is not a substitute for professional healthcare, therapy, financial planning, or emergency support.</li>
        </ul>
      </section>

      <section className="help-section panel" id="guide-terms">
        <h2>Terms and definitions</h2>
        <dl className="help-glossary">
          <div><dt>Active</dt><dd>A record currently included in its feature’s active list or summary.</dd></div>
          <div><dt>Archive</dt><dd>Remove a record from active use while keeping historical records where supported; this is not the same as deleting it.</dd></div>
          <div><dt>Asset</dt><dd>An account or item with positive value that contributes to assets in the wealth summary.</dd></div>
          <div><dt>Category</dt><dd>A label used to group tasks and routines for performance summaries.</dd></div>
          <div><dt>Check-in</dt><dd>A saved event confirming completion of a task or scheduled routine for a day.</dd></div>
          <div><dt>Direct conversation</dt><dd>A private chat conversation between two users.</dd></div>
          <div><dt>Group conversation</dt><dd>A private community conversation shared by members invited when it is created.</dd></div>
          <div><dt>Username</dt><dd>Your unique public handle, used to find you for direct messages and community groups.</dd></div>
          <div><dt>Liability</dt><dd>An account or obligation with a balance counted against assets in net worth.</dd></div>
          <div><dt>Achievement</dt><dd>A persistent milestone earned after reaching a server-checked activity or project threshold.</dd></div>
          <div><dt>Leaderboard opt-in</dt><dd>A preference that allows your display name and activity points to appear in ranked community results.</dd></div>
          <div><dt>Net worth</dt><dd>Assets minus liabilities, calculated separately for each currency.</dd></div>
          <div><dt>Points / XP</dt><dd>Configured points awarded for completion events. XP refers to these accumulated activity points, not a money value.</dd></div>
          <div><dt>Progress</dt><dd>A current measured value against a goal target or a percentage of project completion.</dd></div>
          <div><dt>Read receipt</dt><dd>A saved last-read position used to indicate whether messages have been seen.</dd></div>
          <div><dt>Routine</dt><dd>A repeating activity with selected weekdays and a separate check-in for each scheduled date.</dd></div>
          <div><dt>Recurring task</dt><dd>A task configured for selected weekdays; each scheduled date has its own completion check-in.</dd></div>
          <div><dt>Score</dt><dd>A period performance measure derived from completed activity relative to eligible available activity.</dd></div>
          <div><dt>Score target</dt><dd>A private daily, weekly, or monthly XP or active-day target, or a target for the current streak.</dd></div>
          <div><dt>Streak</dt><dd>A run of consecutive calendar dates with qualifying check-in activity under the app’s current rules.</dd></div>
          <div><dt>Study session</dt><dd>A saved record of a subject, duration, date, and optional topic, project, and notes.</dd></div>
          <div><dt>Target</dt><dd>The measurable amount or outcome a goal aims to reach.</dd></div>
          <div><dt>Wellness entry</dt><dd>A self-reported meal, water, workout, sleep, or habit record; it is not a clinical measurement.</dd></div>
        </dl>
      </section>

      <section className="help-roadmap panel">
        <h2>Scope and integrations</h2>
        <p>
          Dashboard, tasks, goals, routines, reflection, projects, study, wellness,
          wealth, leaderboard, notifications, profile, analytics, chat, help, and
          admin (for authorized accounts) are available as separate screens.
          External calendar sync, bank connections, push notifications, a background
          reminder scheduler, and email notification delivery are not included.
          Account verification and password recovery emails require the email
          provider to be configured by the operator.
        </p>
      </section>
    </div>
  );
}
