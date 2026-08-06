import { useContext, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BusFront,
  Users,
  UserCog,
  GraduationCap,
  Map,
  Wrench,
  Settings,
  LayoutDashboard,
  Component,
  Crown,
  ArrowLeftRight,
  Bell,
} from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { canAccessPath } from "../pages/config/permissions/permissions";
import { fetchMaintenanceOverview } from "../api";

const NAV_SECTIONS = [
  {
    title: "Main",
    items: [
      {
        path: "/dashboard",
        name: "Dashboard",
        icon: <LayoutDashboard size={20} />,
      },
      { path: "/vehicles", name: "Vehicles", icon: <BusFront size={20} /> },
      { path: "/drivers", name: "Drivers", icon: <UserCog size={20} /> },
      { path: "/routes", name: "Routes", icon: <Map size={20} /> },
      { path: "/admins", name: "Admins", icon: <UserCog size={20} /> },
      { path: "/notifications", name: "Notifications", icon: <Bell size={20} /> },
    ],
  },
  {
    title: "People",
    items: [
      {
        path: "/students",
        name: "Students",
        icon: <GraduationCap size={20} />,
      },
      { path: "/parents", name: "Parents", icon: <Users size={20} /> },
      {
        path: "/coordinators",
        name: "Coordinators",
        icon: <Component size={20} />,
      },
      { path: "/hods", name: "HoDs", icon: <Crown size={20} /> },
    ],
  },
  {
    title: "Operations",
    items: [
      { path: "/issues", name: "Maintenance", icon: <Wrench size={20} /> },
      {
        path: "/bus-change",
        name: "Bus Change",
        icon: <ArrowLeftRight size={20} />,
      },
      { path: "/settings", name: "Settings", icon: <Settings size={20} /> },
    ],
  },
];

const Sidebar = () => {
  const { user } = useContext(AuthContext);
  const [maintenanceBadge, setMaintenanceBadge] = useState(0);
  const [maintenanceCritical, setMaintenanceCritical] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadBadge = () => {
      fetchMaintenanceOverview()
        .then((data) => {
          if (cancelled) return;
          setMaintenanceBadge(data?.summary?.openCount || 0);
          setMaintenanceCritical(data?.summary?.criticalCount || 0);
        })
        .catch(() => {
          // Silently ignore — badge just won't update this cycle
        });
    };

    loadBadge();
    const interval = setInterval(loadBadge, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Filter each section down to only the items this user can access,
  // then drop any section that ends up empty.
  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessPath(user, item.path)),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="sidebar">
      <div
        className="sidebar-header"
        style={{
          height: "70px",
          display: "flex",
          alignItems: "center",
          padding: "0 1.5rem",
          gap: "12px",
        }}
      >
        <BusFront size={24} color="var(--primary)" />
        <span
          style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--primary)" }}
        >
          CTMS Admin
        </span>
      </div>

      <nav className="nav-menu">
        {visibleSections.map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map((item) => (
              <NavLink
                to={item.path}
                key={item.name}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                style={{ position: "relative" }}
              >
                {item.icon} {item.name}
                {item.path === "/issues" && maintenanceBadge > 0 && (
                  <span
                    title={`${maintenanceBadge} open · ${maintenanceCritical} critical`}
                    style={{
                      marginLeft: "auto",
                      background: maintenanceCritical > 0 ? "#EF4444" : "#F59E0B",
                      color: "#fff",
                      fontSize: "10px",
                      fontWeight: 800,
                      borderRadius: "999px",
                      minWidth: "18px",
                      height: "18px",
                      padding: "0 5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {maintenanceBadge > 9 ? "9+" : maintenanceBadge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
