/**
 * Fetch Overdue Tasks from ClickUp for any team member
 * 
 * Usage:
 *   node scripts/get-overdue-tasks.mjs [name]
 * 
 * Examples:
 *   node scripts/get-overdue-tasks.mjs sezan
 *   node scripts/get-overdue-tasks.mjs rifat
 *   node scripts/get-overdue-tasks.mjs ovi
 */

const CLICKUP_API_KEY = process.env.CLICKUP_API_KEY || "pk_87418108_J3Z9LHN42XMVMQSMB71U5BZJV0QJGJN1";
const TEAM_ID = "10554421"; // Cogwheel Marketing

const headers = {
  Authorization: CLICKUP_API_KEY,
  "Content-Type": "application/json",
};

/**
 * Get the authenticated user's info (to determine workspace timezone)
 */
async function getUserTimezone() {
  try {
    const res = await fetch("https://api.clickup.com/api/v2/user", { headers });
    if (res.ok) {
      const data = await res.json();
      return data.user?.timezone || "Asia/Dhaka";
    }
  } catch {
    // fallback
  }
  return "Asia/Dhaka";
}

/**
 * Get start of today (00:00:00) in the given timezone as epoch ms
 */
function getStartOfTodayMs(timezone) {
  const now = new Date();
  // Format current date in target timezone as YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(now); // "YYYY-MM-DD"
  
  // Calculate timestamp of 00:00:00 in that timezone
  // Use a localized date calculation
  const dummy = new Date(`${dateStr}T00:00:00Z`);
  const invDate = new Date(dummy.toLocaleString("en-US", { timeZone: timezone }));
  const diff = dummy.getTime() - invDate.getTime();
  return dummy.getTime() + diff;
}

/**
 * Find all team members by querying recent workspace tasks
 */
async function getTeamMembers() {
  const usersMap = new Map();
  try {
    const res = await fetch(
      `https://api.clickup.com/api/v2/team/${TEAM_ID}/task?include_closed=false&page=0`,
      { headers }
    );
    if (res.ok) {
      const data = await res.json();
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
  } catch (err) {
    console.error("Error fetching team members:", err.message);
  }
  return Array.from(usersMap.values());
}

/**
 * Fetch all overdue tasks for a specific user ID
 */
async function fetchOverdueTasks(userId, startOfTodayMs) {
  let allTasks = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`https://api.clickup.com/api/v2/team/${TEAM_ID}/task`);
    url.searchParams.append("assignees[]", String(userId));
    url.searchParams.set("subtasks", "true");
    url.searchParams.set("include_closed", "false");
    url.searchParams.set("due_date_lt", String(startOfTodayMs));
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ClickUp API Error (${res.status}): ${text}`);
    }

    const data = await res.json();
    const tasks = data.tasks || [];
    allTasks = allTasks.concat(tasks);

    if (data.last_page || tasks.length < 100) {
      hasMore = false;
    } else {
      page++;
    }
  }

  return allTasks;
}

async function main() {
  const queryName = process.argv[2] || "sezan";
  console.log("==================================================");
  console.log(`🔍 Searching overdue tasks for: "${queryName}"`);
  console.log("==================================================");

  const timezone = await getUserTimezone();
  const startOfTodayMs = getStartOfTodayMs(timezone);
  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
  }).format(new Date());

  console.log(`📅 Workspace Date: ${todayFormatted} (${timezone})`);

  // Step 1: Find user
  console.log("👥 Looking up team member...");
  const members = await getTeamMembers();
  
  const matched = members.find((m) =>
    m.username.toLowerCase().includes(queryName.toLowerCase()) ||
    m.email.toLowerCase().includes(queryName.toLowerCase())
  );

  if (!matched) {
    console.error(`❌ User matching "${queryName}" not found among active assignees.`);
    console.log("\nAvailable members found in ClickUp:");
    members.forEach((m) => console.log(`  - ${m.username} (${m.email}) [ID: ${m.id}]`));
    process.exit(1);
  }

  console.log(`✅ Found member: ${matched.username} (${matched.email}) [ID: ${matched.id}]`);
  console.log("⏳ Fetching overdue tasks from ClickUp...\n");

  // Step 2: Fetch overdue tasks
  const tasks = await fetchOverdueTasks(matched.id, startOfTodayMs);

  console.log("--------------------------------------------------");
  console.log(`📌 ${tasks.length} Overdue Tasks Found for ${matched.username}`);
  console.log("--------------------------------------------------");

  if (tasks.length === 0) {
    console.log("🎉 No overdue tasks! All caught up.");
    return;
  }

  // Format and list tasks
  tasks.forEach((t, i) => {
    const dueDateStr = t.due_date
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(Number(t.due_date)))
      : "No due date";

    const daysOverdue = t.due_date
      ? Math.floor((Date.now() - Number(t.due_date)) / (1000 * 60 * 60 * 24))
      : 0;

    const assignees = (t.assignees || []).map((a) => a.username).join(", ");
    const isSubtask = !!t.parent;
    const formattedUrl = `https://app.clickup.com/t/${TEAM_ID}/${t.id}`;

    console.log(`${i + 1}. [${t.status?.status?.toUpperCase() || "TODO"}] ${t.name}`);
    console.log(`   🔗 URL:       ${formattedUrl}`);
    console.log(`   📅 Due Date:  ${dueDateStr} (${daysOverdue} days overdue)`);
    console.log(`   👤 Assignees: ${assignees}`);
    if (isSubtask) {
      console.log(`   ↳ Subtask of parent task #${t.parent}`);
    }
    console.log("");
  });

  const formattedUrls = tasks.map((t) => `https://app.clickup.com/t/${TEAM_ID}/${t.id}`);

  console.log("==================================================");
  console.log(`📊 Report Form Overdue Count: ${tasks.length}`);
  console.log("==================================================");
  console.log(`🔗 Team Dev Task Links (Global & Departments):`);
  console.log(`   (Ready for https://report-automation.taion16240.workers.dev/admin/users)\n`);
  formattedUrls.forEach((url) => console.log(url));
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
