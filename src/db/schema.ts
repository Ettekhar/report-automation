import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// ROLES
// ---------------------------------------------------------------------------
export type Role = "admin" | "member" | "reviewer";

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  role: text("role").$type<Role>().notNull().default("member"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// BETTER AUTH INTERNAL TABLES (required by Better Auth v1+)
// ---------------------------------------------------------------------------
export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// TEAM TASK LINKS (shared across whole team, admin-editable)
// ---------------------------------------------------------------------------
export const teamTaskLinks = sqliteTable("team_task_links", {
  id: text("id").primaryKey(),
  url: text("url").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  addedBy: text("added_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// SCHEDULE ASSIGNMENTS
// ---------------------------------------------------------------------------
export const scheduleAssignments = sqliteTable(
  "schedule_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedDate: text("assigned_date").notNull(), // 'YYYY-MM-DD'
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqUserDate: uniqueIndex("schedule_user_date_idx").on(
      t.userId,
      t.assignedDate
    ),
  })
);

// ---------------------------------------------------------------------------
// SUBMISSIONS
// ---------------------------------------------------------------------------
export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    reportDate: text("report_date").notNull(), // 'YYYY-MM-DD'

    // ── Raw WhatsApp paste ────────────────────────────────────────────────
    rawWhatsappText: text("raw_whatsapp_text"),

    // ── Raw structured input (all form values as JSON) ────────────────────
    // This is stored verbatim so we can reconstruct any edit state.
    rawInput: text("raw_input").notNull(), // JSON string

    // ── Denormalised counts for easy aggregation ──────────────────────────
    totalAssigned: integer("total_assigned"),
    tasksDone: integer("tasks_done").notNull().default(0),
    tasksDoneLink: text("tasks_done_link"),
    inReview: integer("in_review").notNull().default(0),
    inProgress: integer("in_progress").notNull().default(0),
    overdueTasks: integer("overdue_tasks").notNull().default(0),
    overdueDependencies: integer("overdue_dependencies").notNull().default(0),
    overdueDepNote: text("overdue_dep_note"),
    tomorrowCount: integer("tomorrow_count"),

    // ── Generated report (server-side, from report-formatter.ts) ─────────
    // Stored separately so raw_input → final_report pairs are always clean.
    finalReport: text("final_report").notNull(),

    // ── Edit tracking ─────────────────────────────────────────────────────
    editedBy: text("edited_by").references(() => users.id),
    editedAt: integer("edited_at", { mode: "timestamp" }),
    editCount: integer("edit_count").notNull().default(0),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqUserDate: uniqueIndex("submission_user_date_idx").on(
      t.userId,
      t.reportDate
    ),
  })
);

// ---------------------------------------------------------------------------
// SUBMISSION EDITS (append-only audit log)
// ---------------------------------------------------------------------------
export const submissionEdits = sqliteTable("submission_edits", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  editedBy: text("edited_by")
    .notNull()
    .references(() => users.id),
  editedAt: integer("edited_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  previousRawInput: text("previous_raw_input").notNull(),
  previousReport: text("previous_report").notNull(),
  changeNote: text("change_note"),
});

// ---------------------------------------------------------------------------
// RELATIONS
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  scheduleAssignments: many(scheduleAssignments),
  submissions: many(submissions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  user: one(users, { fields: [submissions.userId], references: [users.id] }),
  edits: many(submissionEdits),
}));

export const scheduleRelations = relations(scheduleAssignments, ({ one }) => ({
  user: one(users, {
    fields: [scheduleAssignments.userId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [scheduleAssignments.assignedBy],
    references: [users.id],
  }),
}));
