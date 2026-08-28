/**
 * Centralized RBAC Permission System
 *
 * All access decisions flow through this module.
 * To add a new role: add it to the Role type + PERMISSIONS map.
 * To add a new action: add it to the Action type + grant it in PERMISSIONS.
 */

export type Role = "admin" | "member" | "reviewer";

export type Action =
  // Viewing
  | "view:own"      // see your own submissions / schedule
  | "view:all"      // see all users' submissions + reports
  // Submitting
  | "submit:own"    // create/update your own submission
  // Editing
  | "edit:own"      // edit your own submission (within cutoff)
  | "edit:any"      // edit anyone's submission (admin)
  // Schedule
  | "manage:schedule" // create/edit/delete schedule assignments
  // Users
  | "manage:users"  // add/remove users, change roles
  // Data
  | "export:data";  // download fine-tuning JSONL export
  // Team links
  // (viewing is public to all roles; editing is admin-only via manage:users reuse)

export const PERMISSIONS: Record<Role, Action[]> = {
  admin: [
    "view:own",
    "view:all",
    "submit:own",
    "edit:own",
    "edit:any",
    "manage:schedule",
    "manage:users",
    "export:data",
  ],
  reviewer: [
    "view:own",
    "view:all",
    "submit:own",
    "edit:own",
  ],
  member: [
    "view:own",
    "submit:own",
    "edit:own",
  ],
};

/**
 * Returns true if the given role has the given action.
 */
export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

/**
 * Throws a 403-style error if the role does NOT have the action.
 * Use in API routes / server actions.
 */
export function requirePermission(role: Role | undefined | null, action: Action): void {
  if (!role || !can(role, action)) {
    throw new PermissionError(`Role '${role}' cannot perform '${action}'`);
  }
}

export class PermissionError extends Error {
  status = 403;
  constructor(msg: string) {
    super(msg);
    this.name = "PermissionError";
  }
}

/**
 * Returns all roles that have a given action (useful for filtering queries).
 */
export function rolesWithPermission(action: Action): Role[] {
  return (Object.entries(PERMISSIONS) as [Role, Action[]][])
    .filter(([, actions]) => actions.includes(action))
    .map(([role]) => role);
}
