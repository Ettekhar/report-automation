"use client";

import { useState } from "react";
import type { Role } from "@/lib/permissions";

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
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
  currentUserId: string;
}

export default function UserManager({ initialUsers, initialLinks, currentUserId }: Props) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  const [links, setLinks] = useState<TeamLink[]>(initialLinks);
  const [newLinkText, setNewLinkText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {msg && (
        <div className={`alert alert-${msg.type === "success" ? "success" : "error"}`}>
          {msg.text}
        </div>
      )}

      {/* Users table */}
      <div className="card">
        <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Team Members & Roles</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.name} {isSelf && "(You)"}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{u.email}</div>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ width: "auto", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                        value={u.role}
                        disabled={loading || isSelf}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                      >
                        <option value="member">member</option>
                        <option value="reviewer">reviewer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      {!isSelf && (
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Dev Task Links */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Shared Team Dev Task Links</h2>
            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>
              These ClickUp / task URLs automatically appear in every member&apos;s report preview and final output.
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
