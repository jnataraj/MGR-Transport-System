import React, { useState, useEffect } from "react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchNotifications, sendNotification, markNotificationRead, socket } from "../../api";
import { Bell, Send, CheckCircle, AlertTriangle, Info, ShieldAlert, RefreshCw, Filter } from "lucide-react";

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [filterTarget, setFilterTarget] = useState("all");
  const [feedback, setFeedback] = useState({ type: "", message: "" });

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    type: "general",
    target: "all",
  });

  const token = localStorage.getItem("token");

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetchNotifications(token);
      if (res.success) {
        setNotifications(res.notifications || []);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();

    // Listen for real-time notifications
    socket.emit("joinRoom", "admin");
    
    const handleNewNotification = (newNotif) => {
      setNotifications((prev) => [newNotif, ...prev]);
    };

    socket.on("new_notification", handleNewNotification);

    return () => {
      socket.off("new_notification", handleNewNotification);
    };
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      setFeedback({ type: "error", message: "Title and Message are required." });
      return;
    }

    try {
      setSending(true);
      setFeedback({ type: "", message: "" });
      const res = await sendNotification(formData, token);
      if (res.success) {
        setFeedback({ type: "success", message: "Notification broadcasted successfully!" });
        setFormData({ title: "", message: "", type: "general", target: "all" });
        loadNotifications();
      } else {
        setFeedback({ type: "error", message: res.message || "Failed to send notification." });
      }
    } catch (err) {
      setFeedback({ type: "error", message: err.message || "Error broadcasting notification." });
    } finally {
      setSending(false);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id, token);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Error marking notification read:", err);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case "sos":
        return <ShieldAlert size={20} color="#EF4444" />;
      case "maintenance":
        return <AlertTriangle size={20} color="#F59E0B" />;
      case "route":
        return <Info size={20} color="#3B82F6" />;
      default:
        return <Bell size={20} color="#10B981" />;
    }
  };

  const filteredNotifs = notifications.filter(
    (n) => filterTarget === "all" || n.target === filterTarget
  );

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <div style={{ padding: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "1.8rem", color: "#1E293B", fontWeight: 700 }}>
                Notification Center
              </h1>
              <p style={{ margin: "4px 0 0 0", color: "#64748B", fontSize: "0.95rem" }}>
                Send push notifications & real-time announcements to Drivers and Students
              </p>
            </div>
            <button
              onClick={loadNotifications}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "#F1F5F9",
                border: "1px solid #CBD5E1",
                cursor: "pointer",
                fontWeight: 600,
                color: "#334155",
              }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>

          {feedback.message && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                background: feedback.type === "success" ? "#DEF7EC" : "#FDE8E8",
                color: feedback.type === "success" ? "#03543F" : "#9B1C1C",
                border: `1px solid ${feedback.type === "success" ? "#84E1BC" : "#F8B4B4"}`,
                fontWeight: 500,
              }}
            >
              {feedback.message}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "2rem" }}>
            {/* Send Form */}
            <div
              className="glass-panel"
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                padding: "1.5rem",
                boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                border: "1px solid #E2E8F0",
                height: "fit-content",
              }}
            >
              <h2 style={{ fontSize: "1.2rem", margin: "0 0 1.2rem 0", color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                <Send size={18} color="#2563EB" /> Broadcast Notification
              </h2>

              <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Target Audience
                  </label>
                  <select
                    value={formData.target}
                    onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      background: "#F8FAFC",
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="all">All Users (Drivers & Students)</option>
                    <option value="driver">Drivers Only</option>
                    <option value="student">Students Only</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Notification Category
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      background: "#F8FAFC",
                      fontSize: "0.95rem",
                    }}
                  >
                    <option value="general">General Announcement</option>
                    <option value="route">Route Update / Delay</option>
                    <option value="maintenance">Maintenance Alert</option>
                    <option value="emergency">Emergency Alert</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Route 5 Delay Notice"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Message Body
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Type your push notification message..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "0.95rem",
                      resize: "vertical",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: "12px",
                    background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    cursor: sending ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
                  }}
                >
                  <Send size={16} /> {sending ? "Broadcasting..." : "Broadcast Push Notification"}
                </button>
              </form>
            </div>

            {/* Notification History Feed */}
            <div
              className="glass-panel"
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                padding: "1.5rem",
                boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                border: "1px solid #E2E8F0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem" }}>
                <h2 style={{ fontSize: "1.2rem", margin: 0, color: "#0F172A", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Bell size={18} color="#10B981" /> Notification Feed
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Filter size={16} color="#64748B" />
                  <select
                    value={filterTarget}
                    onChange={(e) => setFilterTarget(e.target.value)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #CBD5E1",
                      fontSize: "0.85rem",
                      background: "#F8FAFC",
                    }}
                  >
                    <option value="all">All Targets</option>
                    <option value="driver">Drivers</option>
                    <option value="student">Students</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <p style={{ color: "#64748B", textAlign: "center", padding: "2rem" }}>Loading notification logs...</p>
              ) : filteredNotifs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}>
                  <Bell size={40} style={{ opacity: 0.3, marginBottom: "10px" }} />
                  <p style={{ margin: 0, fontWeight: 500 }}>No notifications found.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "550px", overflowY: "auto", paddingRight: "4px" }}>
                  {filteredNotifs.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "10px",
                        border: "1px solid #E2E8F0",
                        background: item.isRead ? "#F8FAFC" : "#F0F9FF",
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        position: "relative",
                      }}
                    >
                      <div style={{ marginTop: "2px" }}>{getNotifIcon(item.type)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1E293B" }}>
                            {item.title}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p style={{ margin: "0 0 8px 0", color: "#475569", fontSize: "0.9rem", lineHeight: "1.4" }}>
                          {item.message}
                        </p>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: item.target === "driver" ? "#FEF3C7" : item.target === "student" ? "#E0E7FF" : "#E2E8F0",
                              color: item.target === "driver" ? "#92400E" : item.target === "student" ? "#3730A3" : "#334155",
                            }}
                          >
                            Target: {item.target}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                            By: {item.sender}
                          </span>
                        </div>
                      </div>
                      {!item.isRead && (
                        <button
                          onClick={() => handleMarkRead(item.id)}
                          title="Mark as Read"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "#94A3B8",
                          }}
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
