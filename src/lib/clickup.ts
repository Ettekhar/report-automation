/**
 * ClickUp API integration for fetching overdue tasks
 */

export interface ClickUpTask {
  id: string;
  name: string;
  url: string;
  formattedUrl: string; // https://app.clickup.com/t/10554421/{taskId}
  dueDate: string | null;
  dueDateTime: number | null;
  status: string;
  isSubtask: boolean;
  parent: string | null;
  assignees: { id: number; username: string; email: string }[];
}

export interface ClickUpMember {
  id: number;
  username: string;
  email: string;
  initials?: string;
}

const DEFAULT_API_KEY = "pk_87418108_J3Z9LHN42XMVMQSMB71U5BZJV0QJGJN1";
const DEFAULT_TEAM_ID = "10554421";
const DEFAULT_TIMEZONE = "Asia/Dhaka";

export function getClickUpHeaders(apiKey?: string) {
  return {
    Authorization: apiKey || process.env.CLICKUP_API_KEY || DEFAULT_API_KEY,
    "Content-Type": "application/json",
  };
}

export function getStartOfTodayMs(timezone: string = DEFAULT_TIMEZONE): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(now); // "YYYY-MM-DD"
  
  const dummy = new Date(`${dateStr}T00:00:00Z`);
  const invDate = new Date(dummy.toLocaleString("en-US", { timeZone: timezone }));
  const diff = dummy.getTime() - invDate.getTime();
  return dummy.getTime() + diff;
}

export async function fetchClickUpMembers(apiKey?: string, teamId?: string): Promise<ClickUpMember[]> {
  const headers = getClickUpHeaders(apiKey);
  const targetTeamId = teamId || process.env.CLICKUP_TEAM_ID || DEFAULT_TEAM_ID;
  const usersMap = new Map<string, ClickUpMember>();

  try {
    const res = await fetch(
      `https://api.clickup.com/api/v2/team/${targetTeamId}/task?include_closed=false&page=0`,
      { headers }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        tasks?: Array<{
          assignees?: Array<{ id: number; username: string; email: string; initials?: string }>;
        }>;
      };
      for (const t of data.tasks || []) {
        for (const a of t.assignees || []) {
          usersMap.set(String(a.id), {
            id: a.id,
            username: a.username,
            email: a.email,
            initials: a.initials,
          });
        }
      }
    }
  } catch (err: unknown) {
    console.error("[ClickUp] Failed to fetch members:", (err as Error).message);
  }

  return Array.from(usersMap.values());
}

export async function fetchClickUpOverdueTasks(
  queryName: string = "sezan",
  options?: { apiKey?: string; teamId?: string; timezone?: string }
): Promise<{
  member: ClickUpMember;
  tasks: ClickUpTask[];
  urls: string[];
  count: number;
}> {
  const apiKey = options?.apiKey || process.env.CLICKUP_API_KEY || DEFAULT_API_KEY;
  const teamId = options?.teamId || process.env.CLICKUP_TEAM_ID || DEFAULT_TEAM_ID;
  const timezone = options?.timezone || process.env.TEAM_TIMEZONE || DEFAULT_TIMEZONE;
  const headers = getClickUpHeaders(apiKey);

  // 1. Find Member
  const members = await fetchClickUpMembers(apiKey, teamId);
  const normalizedQuery = queryName.trim().toLowerCase();

  const matchedMember = members.find(
    (m) =>
      m.username.toLowerCase().includes(normalizedQuery) ||
      m.email.toLowerCase().includes(normalizedQuery)
  );

  if (!matchedMember) {
    throw new Error(
      `ClickUp member matching "${queryName}" not found. Available active members: ${members
        .map((m) => m.username)
        .join(", ")}`
    );
  }

  // 2. Fetch Overdue Tasks
  const startOfToday = getStartOfTodayMs(timezone);
  let allTasks: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`https://api.clickup.com/api/v2/team/${teamId}/task`);
    url.searchParams.append("assignees[]", String(matchedMember.id));
    url.searchParams.set("subtasks", "true");
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("due_date_lt", String(startOfToday));
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ClickUp API Error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { tasks?: any[]; last_page?: boolean };
    const tasks = data.tasks || [];
    allTasks = allTasks.concat(tasks);

    if (data.last_page || tasks.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // 3. Map to ClickUpTask
  const mappedTasks: ClickUpTask[] = allTasks.map((t) => ({
    id: t.id,
    name: t.name,
    url: t.url || `https://app.clickup.com/t/${t.id}`,
    // Standard format used in report automation database
    formattedUrl: `https://app.clickup.com/t/${teamId}/${t.id}`,
    dueDate: t.due_date ? new Date(Number(t.due_date)).toISOString() : null,
    dueDateTime: t.due_date ? Number(t.due_date) : null,
    status: t.status?.status || "todo",
    isSubtask: !!t.parent,
    parent: t.parent || null,
    assignees: (t.assignees || []).map((a: any) => ({
      id: a.id,
      username: a.username,
      email: a.email,
    })),
  }));

  const urls = mappedTasks.map((t) => t.formattedUrl);

  return {
    member: matchedMember,
    tasks: mappedTasks,
    urls,
    count: mappedTasks.length,
  };
}
