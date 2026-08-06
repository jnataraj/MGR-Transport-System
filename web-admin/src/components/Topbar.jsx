import React, { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Settings, LogOut, Bell } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { fetchNotifications } from "../api";
import logo from "../assets/logo.png";

const Topbar = () => {
  const [showProfile, setShowProfile] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const profileRef = useRef(null);

  const { user, logout, token } = useContext(AuthContext);

  const userName = user?.name || "Guest User";
  const userEmail = user?.email || "";
  const userRole = user?.role || "User";

  const initials = userName
    .split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .substring(0, 2)
    .toUpperCase();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfile(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Poll for unread notifications so the bell badge stays current.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const loadUnread = () => {
      fetchNotifications(token)
        .then((data) => {
          if (cancelled) return;
          const list = data?.notifications || [];
          setUnreadCount(list.filter((n) => !n.isRead).length);
        })
        .catch(() => { });
    };

    loadUnread();
    const interval = setInterval(loadUnread, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header
      className="topbar glass-panel"
      style={{
        position: "relative",
        border: "none",
        borderBottom: "1px solid rgba(255,255,255,.1)",
        borderRadius: 0,
        height: "70px",
      }}
    >
      {/* Logo */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          height: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <img
          src={logo}
          alt="Logo"
          style={{
            height: "70px",
            objectFit: "contain",
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Right Section */}
      <div
        ref={profileRef}
        style={{
          position: "absolute",
          right: 20,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 15,
        }}
      >
        {/* Notification */}
        <button
          onClick={() => navigate("/notifications")}
          title="Notifications"
          style={{
            position: "relative",
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--text-main)",
          }}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "#EF4444",
                color: "#fff",
                borderRadius: "50%",
                minWidth: 18,
                height: 18,
                padding: "0 4px",
                fontSize: 10,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* User Button */}
        <button
          onClick={() => setShowProfile(!showProfile)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "#2563EB",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {initials}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                color: "var(--text-main)",
                fontSize: "15px",
              }}
            >
              {userName}
            </span>

            <span
              style={{
                color: "#64748B",
                fontSize: "12px",
                textTransform: "capitalize",
              }}
            >
              {userRole}
            </span>
          </div>
        </button>

        {/* Dropdown */}
        {showProfile && (
          <div
            className="glass-panel"
            style={{
              position: "absolute",
              top: "115%",
              right: 0,
              width: 300,
              background: "#fff",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 15px 40px rgba(0,0,0,.15)",
              zIndex: 9999,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: 25,
                textAlign: "center",
                borderBottom: "1px solid #E2E8F0",
              }}
            >
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: "50%",
                  background: "#2563EB",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 24,
                  margin: "0 auto 15px",
                }}
              >
                {initials}
              </div>

              <h3
                style={{
                  margin: 0,
                  color: "#1E293B",
                }}
              >
                {userName}
              </h3>

              <p
                style={{
                  marginTop: 5,
                  color: "#64748B",
                  fontSize: 14,
                }}
              >
                {userEmail}
              </p>

              <span
                style={{
                  background: "#DBEAFE",
                  color: "#1D4ED8",
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                }}
              >
                {userRole}
              </span>
            </div>

            {/* Menu */}
            <div style={{ padding: 12 }}>
              <button style={menuButton} onClick={() => navigate("/profile")}>
                <User size={18} />
                My Profile
              </button>

              <button style={menuButton} onClick={() => navigate("/settings")}>
                <Settings size={18} />
                Settings
              </button>

              <hr />

              <button
                style={{
                  ...menuButton,
                  color: "#DC2626",
                  fontWeight: 600,
                  // position: "relative",
                  // zIndex: 500,
                  // zIndex: 500,
                }}
                onClick={handleLogout}
              >
                <LogOut size={18} />
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </header >
  );
};

const menuButton = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  borderRadius: 8,
  fontSize: 15,
  color: "#334155",
};

export default Topbar;