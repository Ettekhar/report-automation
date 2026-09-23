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

/**
 * Resolve a ClickUp task title from a task URL or short id.
 * Returns null when the API call fails or the id cannot be extracted.
 * Used to enrich manually-pasted links with their task title.
 */
export async function fetchClickUpTaskName(
  raw: string,
  apiKey?: string,
  teamId?: string
): Promise<string | null> {
  try {
    const headers = getClickUpHeaders(apiKey);
    // Extract the short task id: .../t/10554421/868j7v43c  or  .../t/868j7v43c
    const match = raw.trim().match(/\/t\/(?:\d+\/)?([A-Za-z0-9]+)(?:[\/?#].*)?$/);
    if (!match) return null;
    const taskId = match[1];
    const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string };
    return data.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch overdue tasks for multiple team members (comma/newline-separated names).
 * Deduplicates tasks by task ID — if sezan and taion share a task, it only appears once.
 */
export async function fetchClickUpOverdueTasksForMultiple(
  queryNames: string | string[],
  options?: { apiKey?: string; teamId?: string; timezone?: string }
): Promise<{
  members: { username: string; email: string; count: number }[];
  tasks: ClickUpTask[];
  urls: string[];
  totalCount: number;
  notFound: string[];
}> {
  // Parse names: accept "sezan,medul,taion" or ["sezan","medul","taion"]
  const names = (Array.isArray(queryNames) ? queryNames : [queryNames])
    .flatMap((n) => n.split(/[,\n\s]+/))
    .map((n) => n.trim())
    .filter(Boolean);

  const apiKey = options?.apiKey || process.env.CLICKUP_API_KEY || DEFAULT_API_KEY;
  const teamId = options?.teamId || process.env.CLICKUP_TEAM_ID || DEFAULT_TEAM_ID;

  // Fetch the member list once, reuse for all names
  const allMembers = await fetchClickUpMembers(apiKey, teamId);

  const seenTaskIds = new Set<string>();
  const dedupedTasks: ClickUpTask[] = [];
  const memberResults: { username: string; email: string; count: number }[] = [];
  const notFound: string[] = [];

  for (const queryName of names) {
    const normalizedQuery = queryName.toLowerCase();
    const matched = allMembers.find(
      (m) =>
        m.username.toLowerCase().includes(normalizedQuery) ||
        m.email.toLowerCase().includes(normalizedQuery)
    );

    if (!matched) {
      notFound.push(queryName);
      continue;
    }

    let result;
    try {
      result = await fetchClickUpOverdueTasks(queryName, options);
    } catch {
      notFound.push(queryName);
      continue;
    }

    let newForThisMember = 0;
    for (const task of result.tasks) {
      if (!seenTaskIds.has(task.id)) {
        seenTaskIds.add(task.id);
        dedupedTasks.push(task);
        newForThisMember++;
      }
    }

    memberResults.push({
      username: matched.username,
      email: matched.email,
      count: result.tasks.length, // total overdue for this person (including shared tasks)
    });
  }

  const urls = dedupedTasks.map((t) => t.formattedUrl);

  return {
    members: memberResults,
    tasks: dedupedTasks,
    urls,
    totalCount: dedupedTasks.length,
    notFound,
  };
}
