import { useCallback, useState } from "react";
import { API_BASE } from "../api/client";

export default function useTravelHistory({ user, token, role }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkedStudentId, setLinkedStudentId] = useState(null);
  const [linkedStudentName, setLinkedStudentName] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("W");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchHistory = useCallback(async () => {
    const userId = user?.id;
    if (!userId) return;

    setLoading(true);
    try {
      let targetUserId = userId;

      if (role === "parent") {
        let resolvedId = linkedStudentId;
        let resolvedName = linkedStudentName;

        if (!resolvedId) {
          const response = await fetch(`${API_BASE}/api/users?role=student`, { headers });
          const data = await response.json();
          const students = Array.isArray(data) ? data : data.users || [];
          const linked = students.find((student) => student.parentId === userId);
          if (linked) {
            resolvedId = linked.id;
            resolvedName = linked.name;
            setLinkedStudentId(resolvedId);
            setLinkedStudentName(resolvedName);
          }
        }

        if (!resolvedId) {
          setItems([]);
          return;
        }
        targetUserId = resolvedId;
      }

      const response = await fetch(
        `${API_BASE}/api/attendance?userId=${encodeURIComponent(targetUserId)}&type=student_scan&limit=100`,
        { headers },
      );
      const data = await response.json();
      setItems(data.success && Array.isArray(data.attendance) ? data.attendance : []);
    } catch (error) {
      console.log("fetchTravelHistory error:", error.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, role, token, linkedStudentId, linkedStudentName]);

  return {
    items,
    loading,
    linkedStudentId,
    linkedStudentName,
    statusFilter,
    setStatusFilter,
    timeFilter,
    setTimeFilter,
    fetch: fetchHistory,
  };
}
