"use client";

import { useState } from "react";
import type { Role } from "@/lib/permissions";
import Link from "next/link";

interface DeptUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface DepartmentWithUsers {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  users: DeptUser[];
}

interface Props {
  initialDepartments: DepartmentWithUsers[];
  currentUserRole: Role;
}

export default function DepartmentManager({ initialDepartments, currentUserRole }: Props) {
  const [departments, setDepartments] = useState<DepartmentWithUsers[]>(initialDepartments);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Edit state
  const [editingDept, setEditingDept] = useState<DepartmentWithUsers | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const isSuperadmin = currentUserRole === "superadmin";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string } & DepartmentWithUsers;
      if (!res.ok) throw new Error(data.error || "Failed to create department");

      setDepartments((prev) => [
        ...prev,
        {
          ...data,
          userCount: 0,
          users: [],
        },
      ]);
      setName("");
      setDescription("");
      setShowCreateModal(false);
      setMsg({ type: "success", text: `Department '${data.name}' created successfully!` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept || !editName.trim()) return;
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch("/api/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingDept.id, name: editName.trim(), description: editDesc.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update department");

      setDepartments((prev) =>
        prev.map((d) =>
          d.id === editingDept.id
            ? { ...d, name: editName.trim(), description: editDesc.trim() || null }
            : d
        )
      );
      setEditingDept(null);
      setMsg({ type: "success", text: `Department '${editName}' updated.` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (dept: DepartmentWithUsers) => {
    if (!confirm(`Are you sure you want to delete '${dept.name}'? Members in this department will become unassigned.`)) {
      return;
    }
    setLoading(true);
    setMsg(null);

    try {
      const res = await fetch(`/api/departments?id=${dept.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete department");

      setDepartments((prev) => prev.filter((d) => d.id !== dept.id));
      setMsg({ type: "success", text: `Department '${dept.name}' removed.` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {msg && (
        <div className={`alert alert-${msg.type === "success" ? "success" : "error"}`}>
          {msg.text}
        </div>
      )}

      {/* Header bar */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            🏢 Department Directory
          </h2>
          <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "4px 0 0" }}>
            {isSuperadmin
              ? "Create and manage organizational departments and monitor team distribution."
              : "View team organizational departments and member assignments."}
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link href="/admin/users" className="btn btn-ghost btn-sm">
            👥 Assign Users &rarr;
          </Link>
          {isSuperadmin && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowCreateModal(true)}
              id="create-department-btn"
            >
              + Create Department
            </button>
          )}
        </div>
      </div>

      {/* Department list */}
      {departments.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏢</div>
          <h3 style={{ fontSize: "1.1rem", color: "#94a3b8", marginBottom: "0.5rem" }}>No departments created yet</h3>
          <p style={{ fontSize: "0.85rem", maxWidth: 420, margin: "0 auto 1.5rem" }}>
            {isSuperadmin
              ? "Set up your organization's departments (e.g., Engineering, Marketing, Design) to organize daily reports and team members."
              : "No departments have been set up by the Superadmin yet."}
          </p>
          {isSuperadmin && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              + Create First Department
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                height: "100%",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                      {dept.name}
                    </h3>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                      Created {new Date(dept.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className="badge badge-info">
                    {dept.users.length} {dept.users.length === 1 ? "Member" : "Members"}
                  </span>
                </div>

                {dept.description && (
                  <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "1rem", lineHeight: 1.4 }}>
                    {dept.description}
                  </p>
                )}

                {/* Member avatars / pills */}
                <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.75rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>
                    Department People
                  </div>

                  {dept.users.length === 0 ? (
                    <div style={{ fontSize: "0.8rem", color: "#475569", fontStyle: "italic" }}>
                      No members assigned yet.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                      {dept.users.map((u) => (
                        <div
                          key={u.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "var(--color-surface-2)",
                            padding: "3px 8px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{u.name}</span>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: u.role === "superadmin" ? "#c084fc" : u.role === "admin" ? "#60a5fa" : "#64748b",
                            }}
                          >
                            ({u.role})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions footer */}
              {isSuperadmin && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "0.5rem",
                    marginTop: "1.25rem",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    paddingTop: "0.75rem",
                  }}
                >
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setEditingDept(dept);
                      setEditName(dept.name);
                      setEditDesc(dept.description || "");
                    }}
                    disabled={loading}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(dept)}
                    disabled={loading}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create Department */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 450 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.1rem", margin: 0 }}>🏢 Create Department</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label" htmlFor="create-dept-name">Department Name *</label>
                <input
                  id="create-dept-name"
                  type="text"
                  className="input"
                  placeholder="e.g. Engineering, Sales, Product..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label className="label" htmlFor="create-dept-desc">Description</label>
                <textarea
                  id="create-dept-desc"
                  className="textarea"
                  rows={3}
                  placeholder="Responsibilities, team objectives, etc..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowCreateModal(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !name.trim()}
                >
                  {loading ? "Creating..." : "Create Department"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Department */}
      {editingDept && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 450 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.1rem", margin: 0 }}>✏️ Edit Department</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEditingDept(null)}
                disabled={loading}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <div style={{ marginBottom: "1rem" }}>
                <label className="label" htmlFor="edit-dept-name">Department Name *</label>
                <input
                  id="edit-dept-name"
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label className="label" htmlFor="edit-dept-desc">Description</label>
                <textarea
                  id="edit-dept-desc"
                  className="textarea"
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingDept(null)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !editName.trim()}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
