import { useState, useEffect, useRef, useCallback } from "react";
import {
  BusFront,
  Plus,
  Edit,
  Trash2,
  Info,
  X,
  Users,
  UserCheck,
  Search,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  UserCog,
  Phone,
  Hash,
  CheckCircle,
} from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import Modal from "../../components/Modal";
import { socket } from "../../api";
import {
  fetchVehicles,
  createVehicle,
  fetchUsers,
  fetchVehicleMembers,
  assignVehicleMembers,
  removeVehicleMember,
  updateVehicle,
  deleteVehicle,
  fetchRoutes,
} from "../../api";
import "./Vehicles.css";
import VehicleChangeHistory from "./VehicleChangeHistory";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";

const MultiSelect = ({
  label,
  icon,
  items,
  selected,
  onChange,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      (i.id && i.id.toLowerCase().includes(query.toLowerCase())),
  );
  const allSelected =
    filtered.length > 0 && filtered.every((i) => selected.includes(i.id));

  const toggle = (id) =>
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  const toggleAll = () => {
    const ids = filtered.map((i) => i.id);
    if (allSelected) onChange(selected.filter((id) => !ids.includes(id)));
    else onChange([...new Set([...selected, ...ids])]);
  };

  return (
    <div ref={ref} className="vf-select-wrap">
      <label className="vf-select-label">
        {icon} {label}{" "}
        {items.length > 0 && (
          <span className="vf-select-count">({items.length} available)</span>
        )}
      </label>
      <div onClick={() => setOpen((o) => !o)} className="vf-select-input">
        <span
          className={
            selected.length ? "vf-select-value" : "vf-select-placeholder"
          }
        >
          {selected.length
            ? `${selected.length} of ${items.length} selected`
            : placeholder}
        </span>
        {open ? (
          <ChevronUp size={15} color="#6b7280" />
        ) : (
          <ChevronDown size={15} color="#6b7280" />
        )}
      </div>
      {open && (
        <div className="vf-dropdown">
          <div className="vf-dropdown-search">
            <Search size={14} color="#6b7280" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="vf-dropdown-search-input"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="vf-dropdown-clear-query"
              >
                ×
              </button>
            )}
          </div>
          <div className="vf-dropdown-selectall" onClick={toggleAll}>
            <div className="vf-dropdown-selectall-left">
              {allSelected ? (
                <CheckSquare size={15} color="var(--vf-navy)" />
              ) : (
                <Square size={15} color="#9ca3af" />
              )}
              <span className="vf-dropdown-selectall-label">
                Select All ({filtered.length})
              </span>
            </div>
            {selected.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="vf-dropdown-clear-btn"
              >
                Clear
              </button>
            )}
          </div>
          <div className="vf-dropdown-list">
            {items.length === 0 ? (
              <div className="vf-dropdown-empty">
                No {label.toLowerCase()} in database
              </div>
            ) : filtered.length === 0 ? (
              <div className="vf-dropdown-empty">No results for "{query}"</div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={
                    "vf-dropdown-item" +
                    (selected.includes(item.id)
                      ? " vf-dropdown-item--selected"
                      : "")
                  }
                >
                  {selected.includes(item.id) ? (
                    <CheckSquare size={15} color="var(--vf-navy)" />
                  ) : (
                    <Square size={15} color="#9ca3af" />
                  )}
                  <div
                    className={
                      "vf-avatar" +
                      (selected.includes(item.id) ? " vf-avatar--active" : "")
                    }
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="vf-item-info">
                    <div className="vf-item-name">{item.name}</div>
                    <div className="vf-item-sub">
                      {item.id.slice(0, 12)}…{" "}
                      {item.phone ? `| ${item.phone}` : ""}{" "}
                      {item.department ? `| ${item.department}` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="vf-dropdown-footer">{selected.length} selected</div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Single-select searchable (for driver) ────────────────────────────────────
const SingleSelect = ({
  label,
  icon,
  items,
  selected,
  onChange,
  placeholder,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      (i.id && i.id.toLowerCase().includes(query.toLowerCase())),
  );
  const selectedItem = items.find((i) => i.id === selected);

  return (
    <div ref={ref} className="vf-select-wrap">
      <label className="vf-select-label">
        {icon} {label}{" "}
        {items.length > 0 && (
          <span className="vf-select-count">({items.length} drivers)</span>
        )}
      </label>
      <div
        onClick={() => setOpen((o) => !o)}
        className={
          "vf-select-input vf-single-input" +
          (selected ? " vf-single-input--selected" : "")
        }
      >
        <div className="vf-single-left">
          {selectedItem ? (
            <>
              <div className="vf-avatar vf-avatar--driver">
                {selectedItem.name.charAt(0)}
              </div>
              <span className="vf-single-name">{selectedItem.name}</span>
            </>
          ) : (
            <span className="vf-select-placeholder">{placeholder}</span>
          )}
        </div>
        <div className="vf-single-right">
          {selected && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="vf-single-clear"
            >
              ×
            </button>
          )}
          {open ? (
            <ChevronUp size={15} color="#6b7280" />
          ) : (
            <ChevronDown size={15} color="#6b7280" />
          )}
        </div>
      </div>
      {open && (
        <div className="vf-dropdown vf-dropdown--single">
          <div className="vf-dropdown-search">
            <Search size={14} color="#6b7280" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search driver by name or ID..."
              className="vf-dropdown-search-input"
            />
          </div>
          <div className="vf-dropdown-list">
            {items.length === 0 ? (
              <div className="vf-dropdown-empty">No drivers in database</div>
            ) : filtered.length === 0 ? (
              <div className="vf-dropdown-empty">No results</div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className={
                    "vf-dropdown-item vf-dropdown-item--driver" +
                    (selected === item.id
                      ? " vf-dropdown-item--driver-selected"
                      : "")
                  }
                >
                  <div className="vf-avatar vf-avatar--driver">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="vf-item-info">
                    <div className="vf-item-name">{item.name}</div>
                    <div className="vf-item-sub">
                      {item.id.slice(0, 12)}…{" "}
                      {item.phone ? `| ${item.phone}` : ""}{" "}
                      {item.license ? `| Lic: ${item.license}` : ""}
                    </div>
                  </div>
                  {selected === item.id && (
                    <CheckCircle size={14} color="#EA580C" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Assigned Members Section (in detail panel) ───────────────────────────────
const AssignedMembersSection = ({ vehicle, onViewAll, onRemoveMember }) => {
  const [members, setMembers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [driverOnline, setDriverOnline] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [newStudentIds, setNewStudentIds] = useState([]);
  const [newCoordIds, setNewCoordIds] = useState([]);
  const [newDriverId, setNewDriverId] = useState("");
  const [students, setStudents] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVehicleMembers(vehicle.id);
      setMembers(data);
      setDriverOnline(!!data.driverOnline);
    } catch (error) {
      console.error("Error fetching vehicle members:", error);
      setMembers(null);
    } finally {
      setLoading(false);
    }
  }, [vehicle.id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      load();
      fetchUsers("student")
        .then(setStudents)
        .catch((error) => {
          console.error("Error loading students:", error);
        });
      fetchUsers("coordinator")
        .then(setCoordinators)
        .catch((error) => {
          console.error("Error loading coordinators:", error);
        });
      fetchUsers("driver")
        .then(setDrivers)
        .catch((error) => {
          console.error("Error loading drivers:", error);
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  useEffect(() => {
    const handler = (d) => {
      if (d.vehicleId === vehicle.id) load();
    };
    socket.on("vehicleMembersUpdated", handler);
    return () => socket.off("vehicleMembersUpdated", handler);
  }, [vehicle.id, load]);

  useEffect(() => {
    const onLive = (d) => {
      if ((d.vehicleId || d.id) === vehicle.number) setDriverOnline(true);
    };
    const onStopped = (d) => {
      if ((d.vehicleId || d.id) === vehicle.number) setDriverOnline(false);
    };
    socket.on("busLocationChanged", onLive);
    socket.on("busLocationStopped", onStopped);
    return () => {
      socket.off("busLocationChanged", onLive);
      socket.off("busLocationStopped", onStopped);
    };
  }, [vehicle.number]);

  const handleAssign = async () => {
    setAssigning(true);
    try {
      await assignVehicleMembers(vehicle.id, {
        studentIds: newStudentIds,
        coordinatorIds: newCoordIds,
        driverId: newDriverId || undefined,
        adminName: "Super Admin",
      });
      setNewStudentIds([]);
      setNewCoordIds([]);
      setNewDriverId("");
      setShowAssign(false);
      await load();
    } catch (error) {
      console.error("Error assigning vehicle members:", error);
    }
    setAssigning(false);
  };

  const secHead = (variant, icon, label) => (
    <div className={`vf-sechead vf-sechead--${variant}`}>
      {icon} {label}
    </div>
  );
  const chip = (label, sub, onDel) => (
    <div className="vf-chip">
      <span className="vf-chip-label">{label}</span>
      {sub && <span className="vf-chip-sub">{sub}</span>}
      {onDel && (
        <button onClick={onDel} className="vf-chip-del">
          ×
        </button>
      )}
    </div>
  );

  return (
    <div className="vf-assigned">
      <div className="vf-assigned-header">
        <span className="vf-assigned-title">
          <Users size={15} /> Assigned Members
        </span>
        <div className="vf-assigned-actions">
          <button
            onClick={() => setShowAssign((s) => !s)}
            className="vf-btn-assign"
          >
            <Plus size={13} /> Assign Members
          </button>
          <button onClick={load} className="vf-btn-refresh">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Assign panel */}
      {showAssign && (
        <div className="vf-assign-panel">
          <div className="vf-assign-grid">
            <SingleSelect
              label="Assign Driver"
              icon={<UserCheck size={13} />}
              items={drivers}
              selected={newDriverId}
              onChange={setNewDriverId}
              placeholder="Search & select driver..."
            />
            <MultiSelect
              label="Add Students"
              icon={<Users size={13} />}
              items={students}
              selected={newStudentIds}
              onChange={setNewStudentIds}
              placeholder="Search students..."
            />
            <MultiSelect
              label="Add Coordinators"
              icon={<UserCog size={13} />}
              items={coordinators}
              selected={newCoordIds}
              onChange={setNewCoordIds}
              placeholder="Search coordinators..."
            />
          </div>
          <div className="vf-assign-actions">
            <button
              onClick={handleAssign}
              disabled={
                assigning ||
                (!newDriverId &&
                  newStudentIds.length === 0 &&
                  newCoordIds.length === 0)
              }
              className="vf-btn-save"
            >
              {assigning
                ? "Saving…"
                : `Save (${(newDriverId ? 1 : 0) + newStudentIds.length + newCoordIds.length} changes)`}
            </button>
            <button
              onClick={() => setShowAssign(false)}
              className="vf-btn-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <div className="vf-loading">Loading members…</div>}

      {!loading && members && (
        <div className="vf-members-grid">
          {/* Driver */}
          {secHead(
            "driver",
            <UserCheck size={13} />,
            "Assigned Driver (GPS Source)",
          )}
          {members.driver ? (
            <div className="vf-driver-card">
              <div className="vf-avatar vf-avatar--driver-lg">
                {members.driver.name.charAt(0)}
              </div>
              <div className="vf-driver-info">
                <div className="vf-driver-name">{members.driver.name}</div>
                <div className="vf-driver-meta">
                  <span>
                    <Hash size={11} className="vf-icon-inline" />{" "}
                    {(members.driver.driverId || members.driver.id || "").slice(
                      0,
                      8,
                    )}
                    …
                  </span>
                  {members.driver.phone && (
                    <span>
                      <Phone size={11} className="vf-icon-inline" />{" "}
                      {members.driver.phone}
                    </span>
                  )}
                  {members.driver.license && (
                    <span>License: {members.driver.license}</span>
                  )}
                </div>
              </div>
              {/* <span className="vf-badge vf-badge--gps">GPS Active</span> */}
              <span className={`vf-badge ${driverOnline ? "vf-badge--gps" : "vf-badge--warn"}`}>
                {driverOnline ? "GPS Active" : "Offline"}
              </span>
            </div>
          ) : (
            <div className="vf-no-driver">
              <span className="vf-badge vf-badge--warn">
                ⚠ No Driver — GPS Inactive
              </span>
              <button
                onClick={() => setShowAssign(true)}
                className="vf-btn-assign-driver"
              >
                Assign Driver
              </button>
            </div>
          )}

          {/* Coordinators */}
          {secHead(
            "coord",
            <UserCog size={13} />,
            `Assigned Coordinators (${members.coordinatorCount})`,
          )}
          <div className="vf-coord-list">
            {members.coordinators.length === 0 ? (
              <span className="vf-empty-text">No coordinators assigned</span>
            ) : (
              members.coordinators.map((c) =>
                chip(
                  c.name,
                  c.phone || (c.coordinatorId || c.id || "").slice(0, 8),
                  () =>
                    onRemoveMember(
                      vehicle.id,
                      "coordinator",
                      c.coordinatorId || c.id,
                    ),
                ),
              )
            )}
          </div>

          {/* Students */}
          {secHead(
            "student",
            <Users size={13} />,
            `Assigned Students (${members.studentCount})`,
          )}
          <div className="vf-student-wrap">
            {members.students.length === 0 ? (
              <span className="vf-empty-text">No students assigned</span>
            ) : (
              <>
                <table className="vf-student-table">
                  <thead>
                    <tr>
                      {["Name", "ID", "Class/Section", "Pickup Point", ""].map(
                        (h) => (
                          <th key={h}>{h}</th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {members.students.slice(0, 5).map((s) => (
                      <tr key={s.studentId || s.id}>
                        <td className="vf-td-name">{s.name}</td>
                        {/* <td className="vf-td-id">{s.studentId.slice(0, 8)}…</td> */}
                        <td className="vf-td-id">
                          {(s.studentId || s.id || "").slice(0, 8)}…
                        </td>
                        <td>{s.class || "—"}</td>
                        <td>{s.pickupPoint || "—"}</td>
                        <td>
                          <button
                            onClick={() =>
                              onRemoveMember(vehicle.id, "student", s.studentId)
                            }
                            className="vf-td-remove"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {members.studentCount > 5 && (
                  <button
                    onClick={() => onViewAll(members)}
                    className="vf-btn-viewall"
                  >
                    <Users size={13} /> View All {members.studentCount} Members
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── View All Members Modal ───────────────────────────────────────────────────
const ViewAllModal = ({ members, onClose, onRemove }) => {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const allItems = [
    ...(members.driver
      ? [
        {
          type: "driver",
          id: members.driver.driverId,
          name: members.driver.name,
          sub: members.driver.phone,
        },
      ]
      : []),
    ...members.coordinators.map((c) => ({
      type: "coordinator",
      id: c.coordinatorId,
      name: c.name,
      sub: c.phone,
    })),
    ...members.students.map((s) => ({
      type: "student",
      id: s.studentId,
      name: s.name,
      sub: s.class,
      extra: s.pickupPoint,
    })),
  ];

  const shown = allItems.filter(
    (i) =>
      (tab === "all" || i.type === tab) &&
      (i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.id.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="vf-modal-overlay" onClick={onClose}>
      <div className="vf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vf-modal-header">
          <h3 className="vf-modal-title">
            <Users size={18} color="var(--vf-navy)" />
            All Members — {members.vehicleNumber}
            <span className="vf-modal-count">{allItems.length} total</span>
          </h3>
          <button onClick={onClose} className="vf-modal-close">
            <X size={16} />
          </button>
        </div>
        <div className="vf-modal-toolbar">
          <div className="vf-modal-search">
            <Search size={14} className="vf-modal-search-icon" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or ID…"
              className="vf-modal-search-input"
            />
          </div>
          {["all", "driver", "coordinator", "student"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "vf-tab-btn" + (tab === t ? " vf-tab-btn--active" : "")
              }
            >
              {t === "all"
                ? `All (${allItems.length})`
                : t === "driver"
                  ? "Driver"
                  : t === "coordinator"
                    ? `Coordinators (${members.coordinatorCount})`
                    : `Students (${members.studentCount})`}
            </button>
          ))}
        </div>
        <div className="vf-modal-body">
          {shown.length === 0 ? (
            <div className="vf-modal-empty">No results</div>
          ) : (
            shown.map((item) => (
              <div key={item.id} className="vf-modal-row">
                <div className={`vf-avatar vf-avatar--${item.type}`}>
                  {item.name.charAt(0)}
                </div>
                <div className="vf-modal-row-info">
                  <div className="vf-modal-row-name">{item.name}</div>
                  <div className="vf-modal-row-sub">
                    {(item.id || "").slice(0, 12)}… {item.sub ? `| ${item.sub}` : ""}{" "}
                    {item.extra ? `| Pickup: ${item.extra}` : ""}
                  </div>
                </div>
                <span className={`vf-type-badge vf-type-badge--${item.type}`}>
                  {item.type}
                </span>
                {item.type !== "driver" && (
                  <button
                    onClick={() =>
                      onRemove(members.vehicleId, item.type, item.id)
                    }
                    className="vf-modal-remove"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ─── VehicleForm ──────────────────────────────────────────────────────────────
const VehicleForm = ({ vehicle, onSave, onCancel }) => {
  const [formData, setFormData] = useState(
    vehicle || {
      number: "",
      circleNumber: "",
      type: "",
      vehicleTypeId: "",
      capacity: "",
      route: "",
      status: "Active",
      chassisNumber: "",
      purchaseDate: "",
      maintenanceDueDate: "",
      rcDetails: "",
      kmRun: 0,
    },
  );
  const [students, setStudents] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState(
    vehicle?.studentIds || [],
  );
  const [selectedCoordIds, setSelectedCoordIds] = useState(
    vehicle?.coordinatorIds || [],
  );
  const [selectedDriverId, setSelectedDriverId] = useState(
    vehicle?.driverId || "",
  );
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [imagePreview, setImagePreview] = useState(vehicle?.image || "");
  const [imageError, setImageError] = useState("");
  const [routesList, setRoutesList] = useState([]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoadingUsers(true);
      Promise.all([
        fetchUsers("student").catch(() => []),
        fetchUsers("coordinator").catch(() => []),
        fetchUsers("driver").catch(() => []),
        fetchRoutes({ isActive: true }).catch(() => []),   // ← add this
      ]).then(([s, c, d, r]) => {
        setStudents(s);
        setCoordinators(c);
        setDrivers(d);

        // Dedupe by routeName — the Routes page can have multiple
        // assignment rows sharing the same route name across vehicles.
        const uniqueRoutes = Array.from(
          new Map((r || []).map((route) => [route.routeName, route])).values(),
        ).sort((a, b) => a.routeName.localeCompare(b.routeName));
        setRoutesList(uniqueRoutes);

        setLoadingUsers(false);
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setImageError("Image must be under 8MB.");
      e.target.value = "";
      return;
    }
    setImageError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 800;
        let { width, height } = img;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        setImagePreview(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => setImageError("Couldn't read that file — try a different image.");
      img.src = ev.target.result;
    };
    reader.onerror = () => setImageError("Couldn't read that file — try a different image.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...formData,
        image: imagePreview || formData.image || undefined,
        studentIds: selectedStudentIds,
        coordinatorIds: selectedCoordIds,
        driverId: selectedDriverId || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const secHead = (variant, label) => (
    <div className={`vf-form-sechead vf-form-sechead--${variant}`}>{label}</div>
  );

  return (
    <form onSubmit={handleSubmit} className="vf-form">
      <div className="vf-form-grid">
        {secHead("basic", "Basic Information")}

        <div>
          <label className="vf-form-label">Vehicle Number *</label>
          <input
            name="number"
            placeholder="TN-XX-XX-XXXX"
            value={formData.number}
            onChange={handleChange}
            required
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Circle Number</label>
          <input
            name="circleNumber"
            placeholder="e.g. 124A"
            value={formData.circleNumber || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Type (Bus/Car) *</label>
          <input
            name="type"
            placeholder="Bus"
            value={formData.type}
            onChange={handleChange}
            required
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Vehicle Type ID</label>
          <input
            name="vehicleTypeId"
            placeholder="e.g. BUS-60, CAR-08"
            value={formData.vehicleTypeId || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Capacity (Seats) *</label>
          <input
            name="capacity"
            type="number"
            value={formData.capacity}
            onChange={handleChange}
            required
            className="vf-form-input"
          />
        </div>

        {/* <div>
          <label className="vf-form-label">Route *</label>
          <input
            name="route"
            placeholder="Assigned Route"
            value={formData.route}
            onChange={handleChange}
            required
            className="vf-form-input"
          />
        </div> */}

        <div>
          <label className="vf-form-label">Route *</label>
          <select
            name="route"
            value={formData.route}
            onChange={handleChange}
            required
            className="vf-form-input"
          >
            <option value="">Select a route…</option>
            {routesList.map((r) => (
              <option key={r.id} value={r.routeName}>
                {r.routeName}
              </option>
            ))}
            {formData.route &&
              !routesList.some((r) => r.routeName === formData.route) && (
                <option value={formData.route}>{formData.route} (current)</option>
              )}
          </select>
          {routesList.length === 0 && (
            <div style={{ color: "#DC2626", fontSize: 12, marginTop: 4 }}>
              No routes found — create one on the Routes page first.
            </div>
          )}
        </div>

        <div>
          <label className="vf-form-label">Status</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="vf-form-input"
          >
            <option value="Active">Active</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Off Duty">Off Duty</option>
          </select>
        </div>

        {secHead("tech", "Technical & Maintenance")}

        <div>
          <label className="vf-form-label">Chassis Number</label>
          <input
            name="chassisNumber"
            placeholder="Chassis No."
            value={formData.chassisNumber || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Purchase Date</label>
          <input
            name="purchaseDate"
            type="date"
            value={formData.purchaseDate || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Maintenance Due Date</label>
          <input
            name="maintenanceDueDate"
            type="date"
            value={formData.maintenanceDueDate || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">RC Details</label>
          <input
            name="rcDetails"
            placeholder="RC Verification String"
            value={formData.rcDetails || ""}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        <div>
          <label className="vf-form-label">Kilometers Run</label>
          <input
            name="kmRun"
            type="number"
            value={formData.kmRun || 0}
            onChange={handleChange}
            className="vf-form-input"
          />
        </div>

        {/* <div className="vf-form-full">
          <label className="vf-form-label">Vehicle Image</label>
          <input
            name="imageFile"
            type="file"
            accept="image/jpeg,image/png"
            className="vf-form-file"
          />
        </div> */}
        <div className="vf-form-full">
          <label className="vf-form-label">Vehicle Image</label>
          <input
            name="imageFile"
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleImageChange}
            className="vf-form-file"
          />
          {imageError && (
            <div style={{ color: "#DC2626", fontSize: 12, marginTop: 4 }}>{imageError}</div>
          )}
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Vehicle preview"
              style={{
                width: 96,
                height: 72,
                objectFit: "cover",
                borderRadius: 8,
                marginTop: 8,
                border: "1px solid #e2e8f0",
              }}
            />
          )}
        </div>

        {secHead("member", "Member Assignment")}

        {loadingUsers ? (
          <div className="vf-form-loading">Loading members from database…</div>
        ) : (
          <>
            <div className="vf-form-full">
              <SingleSelect
                label="Assign Driver (GPS Source)"
                icon={<UserCheck size={14} />}
                items={drivers}
                selected={selectedDriverId}
                onChange={setSelectedDriverId}
                placeholder="Search & select a driver..."
              />
            </div>
            <MultiSelect
              label="Assign Students"
              icon={<Users size={14} />}
              items={students}
              selected={selectedStudentIds}
              onChange={setSelectedStudentIds}
              placeholder="Search & select students..."
            />
            <MultiSelect
              label="Assign Coordinators"
              icon={<UserCog size={14} />}
              items={coordinators}
              selected={selectedCoordIds}
              onChange={setSelectedCoordIds}
              placeholder="Search & select coordinators..."
            />
          </>
        )}

        {(selectedDriverId ||
          selectedStudentIds.length > 0 ||
          selectedCoordIds.length > 0) && (
            <div className="vf-form-summary">
              <CheckCircle size={14} className="vf-form-summary-icon" />
              {selectedDriverId ? "1 driver" : "No driver"} +{" "}
              {selectedStudentIds.length} student(s) + {selectedCoordIds.length}{" "}
              coordinator(s) will be assigned on save.
            </div>
          )}
      </div>

      <div className="vf-form-buttons">
        <button type="button" onClick={onCancel} className="vf-btn-cancel-form">
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary vf-btn-submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Vehicle"}
        </button>
      </div>
    </form>
  );
};

// ─── Main Vehicles Page ───────────────────────────────────────────────────────
const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [viewAllMembers, setViewAllMembers] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // const loadVehicles = useCallback(async () => {
  //   try {
  //     setLoading(true);
  //     const data = await fetchVehicles();
  //     setVehicles(data);
  //   } catch (err) {
  //     console.error("Error loading vehicles:", err);
  //   } finally {
  //     setLoading(false);
  //   }
  // }, []);

  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);

      const [vehicleData, driverData] = await Promise.all([
        fetchVehicles(),
        fetchUsers("driver"),
      ]);

      setVehicles(vehicleData);
      setDrivers(driverData);
    } catch (err) {
      console.error("Error loading vehicles:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadVehicles, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadVehicles]);

  useEffect(() => {
    const handler = () => loadVehicles();
    socket.on("vehicleMembersUpdated", handler);
    socket.on("vehicleCreated", handler);
    socket.on("vehicleUpdated", handler);
    return () => {
      socket.off("vehicleMembersUpdated", handler);
      socket.off("vehicleCreated", handler);
      socket.off("vehicleUpdated", handler);
    };
  }, [loadVehicles]);

  useEffect(() => {
    const refreshStatus = () => {
      loadVehicles();
    };

    socket.on("busLocationChanged", refreshStatus);
    socket.on("busLocationStopped", refreshStatus);

    return () => {
      socket.off("busLocationChanged", refreshStatus);
      socket.off("busLocationStopped", refreshStatus);
    };
  }, [loadVehicles]);

  const handleSave = async (vehicleData) => {
    try {
      if (editVehicle) {
        const updated = await updateVehicle(editVehicle.id, vehicleData);
        if (
          vehicleData.studentIds?.length ||
          vehicleData.coordinatorIds?.length ||
          vehicleData.driverId
        ) {
          await assignVehicleMembers(editVehicle.id, {
            studentIds: vehicleData.studentIds || [],
            coordinatorIds: vehicleData.coordinatorIds || [],
            driverId: vehicleData.driverId,
          });
        }
        setVehicles((prev) =>
          prev.map((v) => (v.id === updated.id ? { ...v, ...updated } : v)),
        );
        setSelectedVehicle((current) =>
          current?.id === updated.id ? { ...current, ...updated } : current,
        );
      } else {
        const created = await createVehicle(vehicleData);
        setVehicles((prev) => [...prev, created]);
      }
      setIsModalOpen(false);
      setEditVehicle(null);
    } catch (err) {
      console.error("Error saving vehicle:", err);
    }
  };

  const handleRemoveMember = async (vehicleId, type, memberId) => {
    if (!window.confirm(`Remove this ${type}?`)) return;
    try {
      await removeVehicleMember(vehicleId, type, memberId);
    } catch (e) {
      console.error(e);
    }
  };


  const confirmDeleteVehicle = async () => {
    if (!deleteTarget) return;
    try {
      await deleteVehicle(deleteTarget.id);
      setVehicles((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      if (selectedVehicle?.id === deleteTarget.id) setSelectedVehicle(null);
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      alert(error.message || "Unable to delete vehicle.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const getVehicleDriverStatus = (vehicle) => {
    // No driver assigned
    if (!vehicle.driverId) {
      return "Offline";
    }

    // Find assigned driver
    const driver = drivers.find((d) => d.id === vehicle.driverId);

    // Driver not found
    if (!driver) {
      return "Offline";
    }

    // Vehicle is Active ONLY when assigned driver is Active
    return driver.status?.toLowerCase() === "active"
      ? "Active"
      : "Offline";
  };

  const isActiveStatus = (status) =>
    status?.toLowerCase() === "active";

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />
        <section className="page-content">
          <div className="vf-page-header">
            <div className="vf-page-heading">
              <div>
                <h1>Vehicle Management</h1>
                <p className="vf-page-subtitle">
                  {loading
                    ? "Loading fleet…"
                    : `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} in the fleet`}
                </p>
              </div>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus size={18} className="vf-btn-icon" /> Add Vehicle
            </button>
          </div>

          {/* Vehicles Table */}
          <div className="vf-table-card">
            <table className="vf-table">
              <thead>
                <tr>
                  <th>Vehicle No</th>
                  <th>Circle No</th>
                  <th>Type</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Halt Records</th>
                  <th>Students Assigned</th>
                  <th>Members</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="vf-table-loading">
                      Loading vehicles…
                    </td>
                  </tr>
                ) : vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="vf-table-loading">
                      No vehicles yet — add your first vehicle to get started.
                    </td>
                  </tr>
                ) : (
                  vehicles.map((v) => (
                    <tr
                      key={v.id}
                      data-status={(v.status || "").toLowerCase()}
                      className={
                        "vf-table-row" +
                        (selectedVehicle?.id === v.id
                          ? " vf-table-row--selected"
                          : "")
                      }
                      onClick={() => setSelectedVehicle(v)}
                    >
                      <td className="vf-td-number">
                        <div className="vf-vehicle-chip">
                          <BusFront size={16} />
                        </div>
                        <div className="vf-td-number-text">
                          <span className="vf-number-main">{v.number}</span>
                          <span className="vf-number-sub">{v.route}</span>
                        </div>
                      </td>
                      <td>
                        {v.circleNumber ? (
                          <span className="vf-td-circle">{v.circleNumber}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {v.type} ({v.capacity} seats)
                      </td>
                      <td>{v.route}</td>
                      <td>
                        {(() => {
                          const vehicleStatus = getVehicleDriverStatus(v);

                          return (
                            <span
                              className={
                                "vf-status-badge " +
                                (isActiveStatus(vehicleStatus)
                                  ? "vf-status-badge--active"
                                  : "vf-status-badge--inactive")
                              }
                            >
                              {vehicleStatus === "Active" ? "Active" : "Offline"}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="vf-td-halt">{v.haltedCount || 0} times</td>

                      {/* Students Assigned count column */}
                      <td>
                        <div className="vf-count-col">
                          <span className="vf-count-badge vf-count-badge--students">
                            <Users size={12} />{" "}
                            {v.assignedStudents?.length || 0} Students
                          </span>
                          <span className="vf-count-badge vf-count-badge--coords">
                            <UserCog size={12} />{" "}
                            {v.assignedCoordinators?.length || 0} Coordinators
                          </span>
                        </div>
                      </td>

                      {/* Members (driver count badge) */}
                      <td>
                        {(v.assignedDrivers?.length || (v.driverId ? 1 : 0)) > 0 ? (
                          <span className="vf-count-badge vf-count-badge--driver">
                            <UserCheck size={12} />{" "}
                            {v.assignedDrivers?.length || 1} Driver
                            {(v.assignedDrivers?.length || 1) === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="vf-badge-nodriver">No Driver</span>
                        )}
                      </td>

                      <td
                        className="vf-td-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="vf-action-edit"
                          onClick={() => {
                            setEditVehicle(v);
                            setIsModalOpen(true);
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          className="vf-action-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(v);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Vehicle Detail Panel */}
          {selectedVehicle && (
            <div className="vf-detail-panel">
              <button
                onClick={() => setSelectedVehicle(null)}
                className="vf-detail-close"
              >
                <X size={20} />
              </button>
              <h3 className="vf-detail-title">
                <Info size={22} color="var(--vf-navy)" /> Complete Vehicle
                Details: {selectedVehicle.number}
              </h3>
              <div className="vf-detail-body">
                <img
                  src={
                    selectedVehicle.image ||
                    `https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&fit=crop`
                  }
                  alt="Vehicle"
                  className="vf-detail-image"
                />
                <div className="vf-detail-grid">
                  <div className="vf-detail-sechead vf-detail-sechead--basic">
                    Basic Information
                  </div>
                  <strong className="vf-detail-label">Circle Number:</strong>{" "}
                  <span className="vf-detail-circle">
                    {selectedVehicle.circleNumber || "Not Assigned"}
                  </span>
                  <strong className="vf-detail-label">Type/Capacity:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.type} ({selectedVehicle.capacity} Seats)
                  </span>
                  <strong className="vf-detail-label">Assigned Route:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.route}
                  </span>
                  <strong className="vf-detail-label">Current Status:</strong>{" "}
                  <span
                    className={
                      "vf-detail-status " +
                      (isActiveStatus(getVehicleDriverStatus(selectedVehicle))
                        ? "vf-detail-status--active"
                        : "vf-detail-status--inactive")
                    }
                  >
                    {getVehicleDriverStatus(selectedVehicle) === "Active"
                      ? "Active"
                      : "Offline"}
                  </span>
                  <strong className="vf-detail-label">RC Details:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.rcDetails || "Not Available"}
                  </span>
                  <strong className="vf-detail-label">Vehicle Type ID:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.vehicleTypeId || "Not Assigned"}
                  </span>
                  <div className="vf-detail-sechead vf-detail-sechead--tech">
                    Technical &amp; Maintenance records
                  </div>
                  <strong className="vf-detail-label">Chassis Number:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.chassisNumber || "Not Available"}
                  </span>
                  <strong className="vf-detail-label">Purchase Date:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.purchaseDate || "Not Available"}
                  </span>
                  <strong className="vf-detail-label">Maintenance Due:</strong>{" "}
                  <span className="vf-detail-maintenance">
                    {selectedVehicle.maintenanceDueDate || "Not Available"}
                  </span>
                  <strong className="vf-detail-label">Kilometers Run:</strong>{" "}
                  <span className="vf-detail-value">
                    {Number(selectedVehicle.kmRun || 0).toLocaleString()} km
                  </span>
                  <strong className="vf-detail-label">Halted History:</strong>{" "}
                  <span className="vf-detail-value">
                    {selectedVehicle.haltedCount || "0"} times
                  </span>
                </div>

                {/* Vehicle QR Code Section */}
                <div className="vf-vehicle-qr-section" style={{
                  marginTop: "20px",
                  padding: "16px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <h4 style={{
                    fontSize: "14px",
                    fontWeight: "800",
                    color: "var(--vf-navy)",
                    margin: "0 0 12px 0",
                    textAlign: "center"
                  }}>
                    🚌 {selectedVehicle.number} QR CODE
                  </h4>
                  <div style={{
                    backgroundColor: "white",
                    padding: "12px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "12px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.05)"
                  }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                        JSON.stringify({
                          vehicleId: selectedVehicle.id,
                          vehicleNumber: selectedVehicle.number,
                          type: "vehicle_qr"
                        })
                      )}`}
                      alt="Vehicle QR Code"
                      style={{ width: "150px", height: "150px" }}
                    />
                  </div>
                  <button
                    className="btn"
                    style={{
                      backgroundColor: "var(--vf-navy)",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                    onClick={() => {
                      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(
                        JSON.stringify({
                          vehicleId: selectedVehicle.id,
                          vehicleNumber: selectedVehicle.number,
                          type: "vehicle_qr"
                        })
                      )}`;
                      const printWindow = window.open("", "_blank");
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Print Vehicle QR Code - ${selectedVehicle.number}</title>
                            <style>
                              body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                              .card { border: 2px solid #000; padding: 40px; border-radius: 20px; text-align: center; }
                              h1 { margin-top: 0; font-size: 28px; }
                              p { font-size: 16px; color: #555; margin-bottom: 20px; }
                              img { width: 300px; height: 300px; }
                            </style>
                          </head>
                          <body onload="window.print();">
                            <div class="card">
                              <h1>DR. MGR TRANSPORTATION</h1>
                              <p>VEHICLE: <strong>${selectedVehicle.number}</strong></p>
                              <img src="${qrUrl}" alt="QR" />
                              <p style="margin-top: 20px; font-size: 12px;">Place this QR code inside the vehicle for scanning.</p>
                            </div>
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }}
                  >
                    Print Vehicle QR
                  </button>
                </div>
                <VehicleChangeHistory vehicleId={selectedVehicle.id} />
              </div>

              <AssignedMembersSection
                vehicle={selectedVehicle}
                onViewAll={setViewAllMembers}
                onRemoveMember={handleRemoveMember}
              />
            </div>
          )}

          {/* Add / Edit Modal */}
          <Modal
            isOpen={isModalOpen}
            onClose={() => {
              setIsModalOpen(false);
              setEditVehicle(null);
            }}
            title={editVehicle ? "Edit Vehicle" : "Add Vehicle"}
          >
            <VehicleForm
              key={editVehicle?.id ?? "new-vehicle"}
              vehicle={editVehicle}
              onSave={handleSave}
              onCancel={() => {
                setIsModalOpen(false);
                setEditVehicle(null);
              }}
            />
          </Modal>

          <ConfirmDialog
            open={!!deleteTarget}
            title={`Delete vehicle "${deleteTarget?.number}"?`}
            message="This will remove all student/coordinator assignments and cannot be undone."
            onConfirm={confirmDeleteVehicle}
            onCancel={() => setDeleteTarget(null)}
          />

          {/* View All Members Modal */}
          {viewAllMembers && (
            <ViewAllModal
              members={viewAllMembers}
              onClose={() => setViewAllMembers(null)}
              onRemove={async (vid, type, mid) => {
                if (!window.confirm(`Remove this ${type}?`)) return;
                await removeVehicleMember(vid, type, mid);
                setViewAllMembers(null);
              }}
            />
          )}
        </section>
      </main>
    </div>
  );
};

export default Vehicles;
