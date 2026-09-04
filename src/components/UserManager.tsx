"use client";

import { useState } from "react";
import type { Role } from "@/lib/permissions";
import Link from "next/link";

interface DepartmentItem {
  id: string;
  name: string;
  description?: string | null;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  createdAt: Date | null;
}

interface TeamLink {
  id: string;
  url: string;
  sortOrder: number;
}

interface Props {
  initialUsers: UserItem[];
  initialLinks: TeamLink[];
  departments: DepartmentItem[];
  currentUserId: string;
  currentUserRole: Role;
}

export default function UserManager({
  initialUsers,
  initialLinks,
  departments: initialDepartments,
  currentUserId,
  currentUserRole,
}: Props) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [links, setLinks] = useState<TeamLink[]>(initialLinks);
  const [departments, setDepartments] = useState<DepartmentItem[]>(initialDepartments);
  const [newLinkText, setNewLinkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters & View State
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");

  // Inline department creation modal state
  const [showNewDeptModal, setShowNewDeptModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [deptCreating, setDeptCreating] = useState(false);

  const isSuperadmin = currentUserRole === "superadmin";

  // Update user role
  const handleRoleChange = async (userId: string, newRole: Role) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setMsg({ type: "success", text: "User role updated successfully" });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Update user department
  const handleDepartmentChange = async (userId: string, departmentId: string) => {
    setLoading(true);
    setMsg(null);
    try {
      const targetDeptId = departmentId === "none" ? null : departmentId;
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, departmentId: targetDeptId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update department");

      const assignedDept = departments.find((d) => d.id === targetDeptId) || null;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                departmentId: targetDeptId,
                department: assignedDept ? { id: assignedDept.id, name: assignedDept.name } : null,
              }
            : u
        )
      );
      setMsg({ type: "success", text: "User department updated successfully" });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Quick Create Department
  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setDeptCreating(true);
    setMsg(null);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeptName.trim(), description: newDeptDesc.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string; id?: string; name?: string; description?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create department");

      setDepartments((prev) => [
        ...prev,
        { id: data.id!, name: data.name!, description: data.description },
      ]);
      setNewDeptName("");
      setNewDeptDesc("");
      setShowNewDeptModal(false);
      setMsg({ type: "success", text: `Department '${data.name}' created successfully!` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setDeptCreating(false);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name}?`)) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/users?userId=${userId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete user");

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setMsg({ type: "success", text: `User ${name} removed.` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Add dev task links
  const handleAddLinks = async () => {
    const urls = newLinkText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (urls.length === 0) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) throw new Error("Failed to add link(s)");

      // Refresh list
      const ref = await fetch("/api/team-links");
      const refData = (await ref.json()) as TeamLink[];
      setLinks(refData);
      setNewLinkText("");
      setMsg({ type: "success", text: "Team task links updated!" });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Delete link
  const handleDeleteLink = async (id: string) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/team-links?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove link");
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setMsg({ type: "success", text: "Link removed" });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    // Dept filter
    if (selectedDeptFilter === "unassigned") {
      if (u.departmentId) return false;
    } else if (selectedDeptFilter !== "all") {
      if (u.departmentId !== selectedDeptFilter) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchDept = u.department?.name?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchDept) return false;
    }

    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {msg && (
        <div className={`alert alert-${msg.type === "success" ? "success" : "error"}`}>
          {msg.text}
        </div>
      )}

      {/* Main Users & Department Card */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <span>👥 Team Members & Departments</span>
              <span className="badge badge-info">{users.length} Users</span>
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "4px 0 0" }}>
              {isSuperadmin
                ? "As Superadmin, you can create departments, assign any role (including Admin), and assign team members to departments."
                : "As Department Leader, you can manage team members, assign Member/Reviewer ranks, and manage dev task links for your department."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {isSuperadmin && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowNewDeptModal(true)}
                >
                  + New Department
                </button>
                <Link href="/admin/departments" className="btn btn-ghost btn-sm">
                  🏢 Department Hub &rarr;
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Toolbar: Filters, Search, and View Switcher */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            background: "var(--color-surface-2)",
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-md)",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", flex: 1 }}>
            {/* Search */}
            <div style={{ minWidth: 200, flex: "1 1 200px" }}>
              <input
                type="text"
                className="input"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.75rem" }}
              />
            </div>

            {/* Department Filter (superadmin only) */}
            {isSuperadmin && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>DEPARTMENT:</span>
                <select
                  className="select"
                  style={{ width: "auto", fontSize: "0.8rem", padding: "0.35rem 0.6rem" }}
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                >
                  <option value="all">All Departments ({users.length})</option>
                  <option value="unassigned">
                    Unassigned ({users.filter((u) => !u.departmentId).length})
                  </option>
                  {departments.map((d) => {
                    const count = users.filter((u) => u.departmentId === d.id).length;
                    return (
                      <option key={d.id} value={d.id}>
                        {d.name} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* View Mode Toggle (superadmin only) */}
          {isSuperadmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.2)", padding: 3, borderRadius: "var(--radius-sm)" }}>
              <button
                className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                onClick={() => setViewMode("table")}
              >
                📑 Table View
              </button>
              <button
                className={`btn btn-sm ${viewMode === "grouped" ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "0.3rem 0.65rem", fontSize: "0.75rem" }}
                onClick={() => setViewMode("grouped")}
              >
                🏢 Department View
              </button>
            </div>
          )}
        </div>

        {/* ── View 1: Standard Table View ── */}
        {viewMode === "table" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
                      No members match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const isTargetAdmin = u.role === "admin" || u.role === "superadmin";
                    const canEditRole = !isSelf && (isSuperadmin || !isTargetAdmin);
                    const canDelete = !isSelf && (isSuperadmin || !isTargetAdmin);

                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {u.name} {isSelf && <span style={{ color: "#38bdf8", fontSize: "0.8rem" }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{u.email}</div>
                        </td>

                        {/* Department selector */}
                        <td>
                          {isSuperadmin ? (
                            <select
                              className="select"
                              style={{
                                width: "auto",
                                minWidth: 140,
                                padding: "0.3rem 0.6rem",
                                fontSize: "0.8rem",
                                borderColor: u.departmentId ? "rgba(99, 102, 241, 0.4)" : undefined,
                              }}
                              value={u.departmentId || "none"}
                              disabled={loading}
                              onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                            >
                              <option value="none">— No Department —</option>
                              {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="badge badge-info" style={{ fontSize: "0.75rem" }}>
                              🏢 {u.department?.name || "Your Department"}
                            </span>
                          )}
                        </td>

                        {/* Role selector */}
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <select
                              className="select"
                              style={{
                                width: "auto",
                                padding: "0.3rem 0.6rem",
                                fontSize: "0.8rem",
                                fontWeight: u.role === "admin" ? 600 : 400,
                              }}
                              value={!isSuperadmin && u.role === "superadmin" ? "admin" : u.role}
                              disabled={loading || !canEditRole}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                              title={
                                !canEditRole && isTargetAdmin && !isSuperadmin
                                  ? "Department leaders cannot modify admin roles"
                                  : undefined
                              }
                            >
                              {isSuperadmin ? (
                                <>
                                  <option value="member">member</option>
                                  <option value="reviewer">reviewer</option>
                                  <option value="admin">admin</option>
                                  <option value="superadmin">⚡ superadmin</option>
                                </>
                              ) : (
                                <>
                                  <option value="member">member</option>
                                  <option value="reviewer">reviewer</option>
                                  {isTargetAdmin && (
                                    <option value="admin" disabled>
                                      admin (Leader)
                                    </option>
                                  )}
                                </>
                              )}
                            </select>

                            {!isSuperadmin && isTargetAdmin && (
                              <span
                                style={{
                                  fontSize: "0.65rem",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(255,255,255,0.06)",
                                  color: "#94a3b8",
                                }}
                                title="Leader rank is protected"
                              >
                                🔒 Leader
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          {canDelete && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              disabled={loading}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── View 2: Grouped by Department View ── */}
        {viewMode === "grouped" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Defined Departments */}
            {departments.map((dept) => {
              const deptMembers = filteredUsers.filter((u) => u.departmentId === dept.id);
              return (
                <div
                  key={dept.id}
                  style={{
                    background: "var(--color-surface-2)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>🏢 {dept.name}</span>
                        <span className="badge badge-info">{deptMembers.length} People</span>
                      </div>
                      {dept.description && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                          {dept.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {deptMembers.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic", padding: "0.5rem 0" }}>
                      No members currently assigned to {dept.name}.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      {deptMembers.map((u) => {
                        const isSelf = u.id === currentUserId;
                        const isTargetAdmin = u.role === "admin" || u.role === "superadmin";
                        const canEditRole = !isSelf && (isSuperadmin || !isTargetAdmin);

                        return (
                          <div
                            key={u.id}
                            style={{
                              background: "var(--color-surface-1)",
                              padding: "0.75rem",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid rgba(255,255,255,0.04)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                                  {u.name} {isSelf && <span style={{ color: "#38bdf8", fontSize: "0.75rem" }}>(You)</span>}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{u.email}</div>
                              </div>
                              <span
                                className={`badge ${
                                  u.role === "superadmin"
                                    ? "badge-admin"
                                    : u.role === "admin"
                                    ? "badge-admin"
                                    : "badge-muted"
                                }`}
                                style={
                                  u.role === "superadmin"
                                    ? { background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff" }
                                    : undefined
                                }
                              >
                                {u.role}
                              </span>
                            </div>

                            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                              <select
                                className="select"
                                style={{ flex: 1, fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                value={u.departmentId || "none"}
                                disabled={loading}
                                onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                              >
                                <option value="none">— Unassign —</option>
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>

                              <select
                                className="select"
                                style={{ width: "auto", fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                value={u.role}
                                disabled={loading || !canEditRole}
                                onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                              >
                                {isSuperadmin ? (
                                  <>
                                    <option value="member">member</option>
                                    <option value="reviewer">reviewer</option>
                                    <option value="admin">admin</option>
                                    <option value="superadmin">superadmin</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="member">member</option>
                                    <option value="reviewer">reviewer</option>
                                    {isTargetAdmin && <option value={u.role} disabled>{u.role}</option>}
                                  </>
                                )}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned Department Group */}
            {(() => {
              const unassignedMembers = filteredUsers.filter((u) => !u.departmentId);
              return (
                <div
                  style={{
                    background: "var(--color-surface-2)",
                    borderRadius: "var(--radius-md)",
                    border: "1px dashed rgba(255,255,255,0.1)",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "#94a3b8", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>📁 Unassigned Members</span>
                        <span className="badge badge-muted">{unassignedMembers.length} People</span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                        Members who haven&apos;t been assigned to a department yet.
                      </div>
                    </div>
                  </div>

                  {unassignedMembers.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "#64748b", fontStyle: "italic", padding: "0.5rem 0" }}>
                      All active members have been assigned to a department!
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      {unassignedMembers.map((u) => {
                        const isSelf = u.id === currentUserId;
                        const isTargetAdmin = u.role === "admin" || u.role === "superadmin";
                        const canEditRole = !isSelf && (isSuperadmin || !isTargetAdmin);

                        return (
                          <div
                            key={u.id}
                            style={{
                              background: "var(--color-surface-1)",
                              padding: "0.75rem",
                              borderRadius: "var(--radius-sm)",
                              border: "1px solid rgba(255,255,255,0.04)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                                  {u.name} {isSelf && <span style={{ color: "#38bdf8", fontSize: "0.75rem" }}>(You)</span>}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{u.email}</div>
                              </div>
                              <span className="badge badge-muted">{u.role}</span>
                            </div>

                            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                              <select
                                className="select"
                                style={{ flex: 1, fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                value="none"
                                disabled={loading}
                                onChange={(e) => handleDepartmentChange(u.id, e.target.value)}
                              >
                                <option value="none">Assign to Dept...</option>
                                {departments.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>

                              <select
                                className="select"
                                style={{ width: "auto", fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                                value={u.role}
                                disabled={loading || !canEditRole}
                                onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                              >
                                {isSuperadmin ? (
                                  <>
                                    <option value="member">member</option>
                                    <option value="reviewer">reviewer</option>
                                    <option value="admin">admin</option>
                                    <option value="superadmin">superadmin</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="member">member</option>
                                    <option value="reviewer">reviewer</option>
                                    {isTargetAdmin && <option value={u.role} disabled>{u.role}</option>}
                                  </>
                                )}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Modal for Superadmin to quickly create department */}
      {showNewDeptModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 450, background: "var(--color-surface-1)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.1rem", margin: 0 }}>🏢 Create New Department</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowNewDeptModal(false)}
                disabled={deptCreating}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDepartment}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label" htmlFor="dept-name">Department Name *</label>
                <input
                  id="dept-name"
                  type="text"
                  className="input"
                  placeholder="e.g. Engineering, Marketing, Operations..."
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label className="label" htmlFor="dept-desc">Description (Optional)</label>
                <textarea
                  id="dept-desc"
                  className="textarea"
                  rows={2}
                  placeholder="Department responsibilities or summary..."
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowNewDeptModal(false)}
                  disabled={deptCreating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={deptCreating || !newDeptName.trim()}
                >
                  {deptCreating ? "Creating..." : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Dev Task Links */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>
              {isSuperadmin ? "Team Dev Task Links (Global & Departments)" : "Department Dev Task Links"}
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>
              {isSuperadmin
                ? "ClickUp / task URLs that appear in member report forms and final generated outputs."
                : "Assign development task URLs for your department. Members will see these prefilled when submitting daily reports."}
            </p>
          </div>
          <span className="badge badge-admin">{links.length} Links</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {links.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>No task links defined yet.</p>
          ) : (
            links.map((l) => (
              <div
                key={l.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "var(--color-surface-2)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  gap: 8,
                }}
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "0.85rem", wordBreak: "break-all" }}
                >
                  {l.url}
                </a>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => handleDeleteLink(l.id)}
                  disabled={loading}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="card-sm">
          <label className="label" htmlFor="new-dev-links">Add New Task Links (one per line)</label>
          <textarea
            id="new-dev-links"
            className="textarea input-mono"
            rows={3}
            placeholder="https://app.clickup.com/t/..."
            value={newLinkText}
            onChange={(e) => setNewLinkText(e.target.value)}
          />
          <button
            className="btn btn-primary"
            style={{ marginTop: "0.75rem" }}
            onClick={handleAddLinks}
            disabled={loading || !newLinkText.trim()}
          >
            + Add Task Links
          </button>
        </div>
      </div>
    </div>
  );
}
