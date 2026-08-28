"use client";

import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Assignment {
  id: string;
  userId: string;
  assignedDate: string;
  userName: string;
}

interface Props {
  users: User[];
  initialAssignments: Assignment[];
}

export default function ScheduleCalendar({ users, initialAssignments }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);

  // Range selection states: YYYY-MM-DD
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || "");
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigation helpers
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setRangeStart(null);
    setRangeEnd(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setRangeStart(null);
    setRangeEnd(null);
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Calculate days in month
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Mapping assignments by date
  const assignmentsByDate = assignments.reduce((acc, a) => {
    if (!acc[a.assignedDate]) acc[a.assignedDate] = [];
    acc[a.assignedDate].push(a);
    return acc;
  }, {} as Record<string, Assignment[]>);

  // Helper to compute array of ISO dates between start and end inclusive
  const getDatesInRange = (startStr: string, endStr: string): string[] => {
    const s = new Date(startStr < endStr ? startStr : endStr);
    const e = new Date(startStr < endStr ? endStr : startStr);
    const results: string[] = [];
    const cur = new Date(s);
    while (cur <= e) {
      results.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return results;
  };

  // Selected dates list
  const selectedDatesList: string[] =
    rangeStart && rangeEnd
      ? getDatesInRange(rangeStart, rangeEnd)
      : rangeStart
      ? [rangeStart]
      : [];

  // Handle clicking a calendar day (Range Selection logic)
  const handleDayClick = (dateStr: string) => {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      // First click or resetting range
      setRangeStart(dateStr);
      setRangeEnd(null);
    } else {
      // Second click: finalize range
      if (dateStr < rangeStart) {
        setRangeEnd(rangeStart);
        setRangeStart(dateStr);
      } else {
        setRangeEnd(dateStr);
      }
    }
  };

  // Quick Preset Helper
  const setPresetRange = (startDay: number, endDay: number) => {
    const s = Math.max(1, startDay);
    const e = Math.min(daysInMonth, endDay);
    const startStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(s).padStart(2, "0")}`;
    const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(e).padStart(2, "0")}`;
    setRangeStart(startStr);
    setRangeEnd(endStr);
  };

  // Assign user to all selected dates in range
  const handleAssignRange = async () => {
    if (selectedDatesList.length === 0 || !selectedUserId) return;
    setLoading(true);
    setMsg(null);

    const userObj = users.find((u) => u.id === selectedUserId);
    const userName = userObj ? userObj.name : "User";

    const payload = {
      assignments: selectedDatesList.map((d) => ({
        userId: selectedUserId,
        date: d,
      })),
      replace: replaceExisting,
    };

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to assign schedule");

      // Update local state
      const targetDates = new Set(selectedDatesList);
      setAssignments((prev) => {
        let filtered = prev;
        if (replaceExisting) {
          filtered = prev.filter((a) => !targetDates.has(a.assignedDate));
        } else {
          filtered = prev.filter(
            (a) => !(targetDates.has(a.assignedDate) && a.userId === selectedUserId)
          );
        }
        const additions: Assignment[] = selectedDatesList.map((d) => ({
          id: `${selectedUserId}-${d}`,
          userId: selectedUserId,
          assignedDate: d,
          userName,
        }));
        return [...filtered, ...additions];
      });

      const sLabel = selectedDatesList[0];
      const eLabel = selectedDatesList[selectedDatesList.length - 1];
      setMsg({
        type: "success",
        text: `✓ Assigned ${selectedDatesList.length} day(s) (${sLabel} to ${eLabel}) to ${userName}`,
      });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Clear/Remove all assignments in the selected range
  const handleClearRange = async () => {
    if (selectedDatesList.length === 0) return;
    if (!confirm(`Are you sure you want to clear assignments for ${selectedDatesList.length} day(s)?`)) return;

    setLoading(true);
    setMsg(null);

    const s = selectedDatesList[0];
    const e = selectedDatesList[selectedDatesList.length - 1];

    try {
      const res = await fetch(`/api/schedule?from=${s}&to=${e}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to clear range");

      const targetDates = new Set(selectedDatesList);
      setAssignments((prev) => prev.filter((a) => !targetDates.has(a.assignedDate)));
      setMsg({ type: "success", text: `Cleared schedule from ${s} to ${e}` });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Duplicate the selected range to the subsequent period
  const handleDuplicateToNextPeriod = async () => {
    if (selectedDatesList.length === 0) return;
    setLoading(true);
    setMsg(null);

    const span = selectedDatesList.length;
    const newAssignmentsPayload: { userId: string; date: string }[] = [];
    const updatedLocalList: Assignment[] = [];

    selectedDatesList.forEach((d) => {
      const curDateObj = new Date(d);
      const targetDateObj = new Date(curDateObj);
      targetDateObj.setDate(curDateObj.getDate() + span);
      const targetDateStr = targetDateObj.toISOString().slice(0, 10);

      const existingForDay = assignmentsByDate[d] || [];
      for (const a of existingForDay) {
        newAssignmentsPayload.push({ userId: a.userId, date: targetDateStr });
        updatedLocalList.push({
          id: `${a.userId}-${targetDateStr}`,
          userId: a.userId,
          assignedDate: targetDateStr,
          userName: a.userName,
        });
      }
    });

    if (newAssignmentsPayload.length === 0) {
      setMsg({ type: "error", text: "No assignments found in selected range to copy." });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: newAssignmentsPayload, replace: true }),
      });
      if (!res.ok) throw new Error("Failed to duplicate schedule");

      setAssignments((prev) => {
        const targetDates = new Set(newAssignmentsPayload.map((p) => p.date));
        const kept = prev.filter((a) => !targetDates.has(a.assignedDate));
        return [...kept, ...updatedLocalList];
      });

      setMsg({
        type: "success",
        text: `✓ Duplicated ${newAssignmentsPayload.length} assignment(s) to the following ${span}-day window!`,
      });
    } catch (err: unknown) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Group continuous assignment blocks for the month summary
  const monthAssignments = assignments
    .filter((a) => a.assignedDate.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .sort((a, b) => a.assignedDate.localeCompare(b.assignedDate));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
      {/* ── Top Header & Month Navigation ────────────────────────── */}
      <div className="card" style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: "1.3rem", margin: 0, fontWeight: 700 }}>
              {monthNames[month]} {year}
            </h2>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={prevMonth}>&larr; Prev Month</button>
              <button className="btn btn-ghost btn-sm" onClick={nextMonth}>Next Month &rarr;</button>
            </div>
          </div>

          {/* Quick 7-day presets */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Quick 7-Day Ranges:
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresetRange(1, 7)}>
              1st – 7th
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresetRange(8, 14)}>
              8th – 14th
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresetRange(15, 21)}>
              15th – 21st
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresetRange(22, 28)}>
              22nd – 28th
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPresetRange(29, 31)}>
              29th – End
            </button>
          </div>
        </div>

        {msg && (
          <div className={`alert alert-${msg.type === "success" ? "success" : "error"}`} style={{ marginTop: "1rem" }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* ── Main Workspace (Calendar + Range Assignment Panel) ───── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        
        {/* Calendar Grid Column */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <span className="label" style={{ margin: 0 }}>
              📅 Click a start day, then click an end day to select a range
            </span>
            {selectedDatesList.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: "0.72rem", padding: "2px 6px" }}
                onClick={() => { setRangeStart(null); setRangeEnd(null); }}
              >
                Reset selection
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 8, fontWeight: 600, fontSize: "0.75rem", color: "#94a3b8" }}>
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="cal-grid">
            {/* Blank offset days for start of month */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="cal-day other-month" />
            ))}

            {/* Calendar Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayAssignments = assignmentsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isInSelectedRange = selectedDatesList.includes(dateStr);
              const isRangeBoundary = dateStr === rangeStart || dateStr === rangeEnd;

              return (
                <div
                  key={dateStr}
                  className={`cal-day ${isToday ? "today" : ""} ${dayAssignments.length > 0 ? "has-assigned" : ""}`}
                  style={{
                    background: isInSelectedRange
                      ? "rgba(99, 102, 241, 0.25)"
                      : undefined,
                    border: isRangeBoundary
                      ? "2px solid var(--color-brand-400)"
                      : isInSelectedRange
                      ? "1px solid rgba(129, 140, 248, 0.5)"
                      : undefined,
                    cursor: "pointer",
                    position: "relative",
                  }}
                  onClick={() => handleDayClick(dateStr)}
                  title={isInSelectedRange ? `Selected in range (${dateStr})` : `Click to select (${dateStr})`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                    <span style={{ fontWeight: isToday || isRangeBoundary ? 800 : 500, fontSize: "0.8rem" }}>
                      {dayNum}
                    </span>
                    {isToday && (
                      <span style={{ fontSize: "0.55rem", color: "var(--color-brand-400)", fontWeight: 700 }}>
                        TODAY
                      </span>
                    )}
                  </div>

                  {dayAssignments.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", overflow: "hidden", marginTop: 2 }}>
                      {dayAssignments.map((a) => (
                        <div
                          key={a.id}
                          style={{
                            fontSize: "0.62rem",
                            background: "rgba(99,102,241,0.45)",
                            color: "#ffffff",
                            fontWeight: 600,
                            borderRadius: 3,
                            padding: "1px 3px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "center",
                          }}
                          title={`Assigned: ${a.userName}`}
                        >
                          {a.userName.split(" ")[0]}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Range Assignment Controls Column ──────────────────────── */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <h3 style={{ fontSize: "1.15rem", margin: "0 0 0.25rem", fontWeight: 700 }}>
              {selectedDatesList.length > 0
                ? `Assign Selected Range (${selectedDatesList.length} Day${selectedDatesList.length > 1 ? "s" : ""})`
                : "Select a Date Range to Assign"}
            </h3>
            <p style={{ fontSize: "0.82rem", color: "#64748b", margin: 0 }}>
              {selectedDatesList.length > 0
                ? `Active Range: ${selectedDatesList[0]} → ${selectedDatesList[selectedDatesList.length - 1]}`
                : "Click any day on the calendar (e.g. 1st then 7th), or use a 7-Day preset button above."}
            </p>
          </div>

          {selectedDatesList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Assign to User box */}
              <div className="card-sm">
                <label className="label" style={{ marginBottom: "0.5rem" }}>
                  👤 Select Team Member for this {selectedDatesList.length}-day shift:
                </label>
                <select
                  className="select"
                  style={{ width: "100%", marginBottom: "0.75rem", fontSize: "0.9rem" }}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role}) — {u.email}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
                  <input
                    type="checkbox"
                    id="replace-chk"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                  <label htmlFor="replace-chk" style={{ fontSize: "0.8rem", color: "#94a3b8", cursor: "pointer" }}>
                    Overwrite any previous assignments in this range
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={handleAssignRange}
                    disabled={loading || !selectedUserId}
                  >
                    {loading ? <span className="spinner" /> : `✨ Assign ${selectedDatesList.length} Day(s)`}
                  </button>

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleClearRange}
                    disabled={loading}
                    title="Clear assignments on selected days"
                  >
                    🗑️ Clear Range
                  </button>
                </div>
              </div>

              {/* Duplicate Range to Next Period */}
              <div className="card-sm">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span className="label" style={{ margin: 0 }}>🔁 Replicate to Next Period</span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.75rem" }}>
                  Duplicate the schedule from this {selectedDatesList.length}-day block into the following {selectedDatesList.length} days.
                </p>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={handleDuplicateToNextPeriod}
                  disabled={loading}
                >
                  📋 Copy Range to Next {selectedDatesList.length} Days
                </button>
              </div>
            </div>
          ) : (
            <div className="card-sm" style={{ textAlign: "center", padding: "2rem 1rem" }}>
              <div style={{ fontSize: 32, marginBottom: "0.5rem" }}>🗓️</div>
              <p style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.25rem" }}>No dates selected</p>
              <p style={{ fontSize: "0.8rem", color: "#64748b", margin: 0 }}>
                Click a start date (e.g. 1st) then an end date (e.g. 7th) to assign a weekly reporting shift.
              </p>
            </div>
          )}

          {/* Monthly Shift Summary */}
          <div>
            <p className="label" style={{ marginBottom: "0.5rem" }}>
              📋 Scheduled Reporters this Month ({monthAssignments.length} total shifts)
            </p>
            {monthAssignments.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "#475569" }}>No shifts assigned for this month yet.</p>
            ) : (
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {monthAssignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.78rem",
                      padding: "4px 8px",
                      background: "var(--color-surface-2)",
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "#cbd5e1" }}>{a.assignedDate}</span>
                    <span className="badge badge-member">{a.userName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
