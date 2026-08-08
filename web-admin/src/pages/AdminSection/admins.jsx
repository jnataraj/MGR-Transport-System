import { useState, useEffect, useCallback } from "react";
import { Plus, X, Edit2, Trash2, UserPlus, UserMinus } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import {
    fetchAdminSections,
    createAdminSection,
    updateAdminSection,
    deleteAdminSection,
    setAdminSectionIncharge,
    removeAdminSectionIncharge,
    fetchAdmins,
    createAdmin,
    updateAdmin,
    deleteAdmin,
} from "../../api";
import { SECTOR_DEFAULT_PERMISSIONS } from "../../pages/config/permissions/permissions";
import "./admins.css";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";

const SECTION_COLORS = ["#DC2626", "#D97706", "#7C3AED", "#2563EB", "#059669"];

// Module-level permission keys — the checklist shown for a given sector is
// filtered down to only the keys listed for it in SECTOR_DEFAULT_PERMISSIONS.
const PERMISSIONS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "driverStaffManagement", label: "Driver & Staff Management" },
    { key: "vehicleManagement", label: "Vehicle Management (Full Fleet)" },
    {
        key: "vehicleManagementAssignedOnly",
        label: "Vehicle Management (Assigned Vehicle Only)",
    },
    { key: "routeManagement", label: "Route Management" },
    { key: "studentManagement", label: "Student Management" },
    { key: "parentManagement", label: "Parent / Guardian Management" },
    { key: "coordinatorManagement", label: "Coordinator Management" },
    { key: "hodManagement", label: "HoD Management" },
    { key: "maintenanceManagement", label: "Maintenance Management" },
    { key: "busChangeManagement", label: "Bus Change Management" },
    {
        key: "zoneAttendanceMonitor",
        label: "Zone Attendance Monitor (Dashboard)",
    },
];

const EMPTY_ADMIN_FORM = {
    // sector: "",
    sectors: [],
    permissions: [],
    name: "",
    employeeId: "",
    phone: "",
    email: "",
    roleHeader: "",
    department: "",
    loginId: "",
    password: "",
};

const Admins = () => {
    const [sections, setSections] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);

    // Modals: null | "addSection" | "editSection" | "addAdmin" | "editAdmin" | "addIncharge"
    const [modal, setModal] = useState(null);
    const [activeSection, setActiveSection] = useState(null);

    const [sectionForm, setSectionForm] = useState({ name: "" });
    const [inchargeChoice, setInchargeChoice] = useState("");
    const [adminForm, setAdminForm] = useState(EMPTY_ADMIN_FORM);
    const [editingAdminId, setEditingAdminId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [s, a] = await Promise.all([fetchAdminSections(), fetchAdmins()]);
            setSections(Array.isArray(s) ? s : []);
            setAdmins(Array.isArray(a) ? a : []);
        } catch (err) {
            console.error("Failed to load admin data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const closeModal = () => {
        setModal(null);
        setActiveSection(null);
        setSectionForm({ name: "" });
        setInchargeChoice("");
        setAdminForm(EMPTY_ADMIN_FORM);
        setEditingAdminId(null);
        setError("");
    };

    /* ── Section actions ── */
    const openAddSection = () => {
        setSectionForm({ name: "" });
        setModal("addSection");
    };

    const openEditSection = (section) => {
        setActiveSection(section);
        setSectionForm({ name: section.name });
        setInchargeChoice(section.incharge?.id || "");
        setModal("editSection");
    };

    const submitAddSection = async () => {
        if (!sectionForm.name.trim()) return setError("Section name is required");
        setSaving(true);
        setError("");
        try {
            await createAdminSection({ name: sectionForm.name.trim() });
            await loadAll();
            closeModal();
        } catch (err) {
            setError(err.message || "Failed to create section");
        } finally {
            setSaving(false);
        }
    };

    const submitEditSection = async () => {
        if (!sectionForm.name.trim()) return setError("Section name is required");
        setSaving(true);
        setError("");
        try {
            await updateAdminSection(activeSection.id, {
                name: sectionForm.name.trim(),
                inchargeId: inchargeChoice || null,
            });
            await loadAll();
            closeModal();
        } catch (err) {
            setError(err.message || "Failed to update section");
        } finally {
            setSaving(false);
        }
    };

    // const handleDeleteSection = async (section) => {
    //     if (!window.confirm(`Delete "${section.name}"? This cannot be undone.`))
    //         return;
    //     try {
    //         await deleteAdminSection(section.id);
    //         await loadAll();
    //     } catch (err) {
    //         alert(err.message || "Failed to delete section");
    //     }
    // };

    const handleDeleteSection = (section) => {
        setConfirmDelete({ type: "section", item: section });
    };

    const openAddIncharge = (section) => {
        setActiveSection(section);
        setInchargeChoice(section.incharge?.id || "");
        setModal("addIncharge");
    };

    const submitAddIncharge = async () => {
        if (!inchargeChoice) return setError("Select an admin to assign");
        setSaving(true);
        setError("");
        try {
            await setAdminSectionIncharge(activeSection.id, inchargeChoice);
            await loadAll();
            closeModal();
        } catch (err) {
            setError(err.message || "Failed to assign incharge");
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveAllIncharge = async (section) => {
        if (!section.incharge) return;
        try {
            await removeAdminSectionIncharge(section.id);
            await loadAll();
        } catch (err) {
            alert(err.message || "Failed to remove incharge");
        }
    };

    /* ── Admin actions ── */
    const openAddAdmin = () => {
        const defaultSector = sections[0]?.name || "";
        setAdminForm({
            ...EMPTY_ADMIN_FORM,
            // sector: defaultSector,
            // permissions: SECTOR_DEFAULT_PERMISSIONS[defaultSector] || [],
            sectors: [],
            permissions: [],
        });
        setEditingAdminId(null);
        setModal("addAdmin");
    };

    // const openEditAdmin = (admin) => {
    //     setAdminForm({
    //         sector: admin.sector || "",
    //         permissions: admin.permissions || [],
    //         name: admin.name || "",
    //         employeeId: admin.employeeId || "",
    //         phone: admin.phone || "",
    //         email: admin.email || "",
    //         roleHeader: admin.roleHeader || "",
    //         department: admin.department || "",
    //         loginId: admin.loginId || "",
    //         password: "",
    //     });
    //     setEditingAdminId(admin.id);
    //     setModal("addAdmin");
    // };

    const openEditAdmin = (admin) => {
        const sectors = Array.isArray(admin.sectors)
            ? admin.sectors
            : admin.sector
                ? [admin.sector]
                : [];

        setAdminForm({
            sectors,
            permissions: admin.permissions || [],
            name: admin.name || "",
            employeeId: admin.employeeId || "",
            phone: admin.phone || "",
            email: admin.email || "",
            roleHeader: admin.roleHeader || "",
            department: admin.department || "",
            loginId: admin.loginId || "",
            password: "",
        });

        setEditingAdminId(admin.id);
        setModal("addAdmin");
    };

    const handleSectorChange = (sector) => {
        setAdminForm((prev) => {
            const exists = prev.sectors.includes(sector);

            const updatedSectors = exists
                ? prev.sectors.filter((s) => s !== sector)
                : [...prev.sectors, sector];

            // Merge permissions from all selected sectors
            const mergedPermissions = [
                ...new Set(
                    updatedSectors.flatMap(
                        (s) => SECTOR_DEFAULT_PERMISSIONS[s] || []
                    )
                ),
            ];

            return {
                ...prev,
                sectors: updatedSectors,
                permissions: mergedPermissions,
            };
        });
    };

    const togglePermission = (key) => {
        setAdminForm((p) => ({
            ...p,
            permissions: p.permissions.includes(key)
                ? p.permissions.filter((k) => k !== key)
                : [...p.permissions, key],
        }));
    };

    const submitAdminForm = async () => {
        if (!adminForm.name.trim() || !adminForm.email.trim()) {
            return setError("Name and Email are required");
        }
        if (!editingAdminId && !adminForm.password) {
            return setError("Password is required for new admins");
        }

        setSaving(true);
        setError("");
        try {
            // const payload = { ...adminForm };
            const payload = {
                ...adminForm,
                sectors: adminForm.sectors,
            };
            if (!payload.password) delete payload.password;

            if (editingAdminId) {
                await updateAdmin(editingAdminId, payload);
            } else {
                await createAdmin(payload);
            }
            await loadAll();
            closeModal();
        } catch (err) {
            setError(err.message || "Failed to save admin");
        } finally {
            setSaving(false);
        }
    };

    // const handleDeleteAdmin = async (admin) => {
    //     if (!window.confirm(`Delete admin "${admin.name}"?`)) return;
    //     try {
    //         await deleteAdmin(admin.id);
    //         await loadAll();
    //     } catch (err) {
    //         alert(err.message || "Failed to delete admin");
    //     }
    // };

    const handleDeleteAdmin = (admin) => {
        setConfirmDelete({ type: "admin", item: admin });
    };

    const runConfirmedDelete = async () => {
        if (!confirmDelete) return;
        const { type, item } = confirmDelete;
        try {
            if (type === "section") {
                await deleteAdminSection(item.id);
            } else if (type === "admin") {
                await deleteAdmin(item.id);
            }
            await loadAll();
        } catch (err) {
            alert(err.message || `Failed to delete ${type}`);
        } finally {
            setConfirmDelete(null);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar />
            <main className="main-content">
                <Topbar />
                <section className="page-content adm-page">
                    {/* ── Admin Sections ── */}
                    <div className="adm-header-row">
                        <h1 className="adm-title">Admin Sections</h1>
                        <button className="adm-btn adm-btn--primary" onClick={openAddSection}>
                            <Plus size={16} /> Add Section
                        </button>
                    </div>

                    <div className="adm-section-grid">
                        {loading ? (
                            <div className="adm-empty">Loading sections…</div>
                        ) : sections.length === 0 ? (
                            <div className="adm-empty">
                                No sections yet. Click "Add Section" to create one.
                            </div>
                        ) : (
                            sections.map((section, i) => (
                                <div
                                    key={section.id}
                                    className="adm-section-card"
                                    style={{
                                        borderTop: `4px solid ${SECTION_COLORS[i % SECTION_COLORS.length]
                                            }`,
                                    }}
                                >
                                    <div className="adm-section-card-top">
                                        <div className="adm-section-name">{section.name}</div>
                                        <div className="adm-section-actions">
                                            <button
                                                className="adm-link adm-link--edit"
                                                onClick={() => openEditSection(section)}
                                            >
                                                <Edit2 size={12} /> Edit
                                            </button>
                                            <button
                                                className="adm-link adm-link--delete"
                                                onClick={() => handleDeleteSection(section)}
                                            >
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        </div>
                                    </div>

                                    <div className="adm-section-count">
                                        {section.inchargeCount} Incharge(s) assigned
                                    </div>

                                    <div className="adm-section-incharge">
                                        {section.incharge ? (
                                            <span>👤 {section.incharge.name}</span>
                                        ) : (
                                            <span className="adm-muted">
                                                👤 Incharge Not Assigned
                                            </span>
                                        )}
                                    </div>

                                    <div className="adm-section-card-footer">
                                        <button
                                            className="adm-link adm-link--add"
                                            onClick={() => openAddIncharge(section)}
                                        >
                                            <UserPlus size={12} /> Add Incharge
                                        </button>
                                        <button
                                            className="adm-link adm-link--remove"
                                            onClick={() => handleRemoveAllIncharge(section)}
                                        >
                                            <UserMinus size={12} /> Remove All
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* ── List of Admins ── */}
                    <div className="adm-list-header-row">
                        <div>
                            <h2 className="adm-title">List of Admins</h2>
                            <p className="adm-subtitle">
                                Manage assigned regional and sectoral system admins
                            </p>
                        </div>
                        <button className="adm-btn adm-btn--primary" onClick={openAddAdmin}>
                            <Plus size={16} /> Add Admin
                        </button>
                    </div>

                    <div className="adm-table-wrap">
                        <table className="adm-table">
                            <thead>
                                <tr>
                                    <th>Admin Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Admin Section / Incharge</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="adm-empty-cell">
                                            Loading admins…
                                        </td>
                                    </tr>
                                ) : admins.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="adm-empty-cell">
                                            No admins added yet.
                                        </td>
                                    </tr>
                                ) : (
                                    admins.map((admin) => (
                                        <tr key={admin.id}>
                                            <td className="adm-name-cell">👤 {admin.name}</td>
                                            <td>{admin.email}</td>
                                            <td>{admin.roleHeader || "Dept Admin"}</td>
                                            <td>
                                                {/* {admin.sector ? (
                                                    <span className="adm-badge">
                                                        Admin Section: {admin.sector}
                                                    </span>
                                                ) : (
                                                    <span className="adm-muted">Unassigned</span>
                                                )} */}
                                                {admin.sectors?.length ? (
                                                    <span className="adm-badge">
                                                        {admin.sectors.join(", ")}
                                                    </span>
                                                ) : admin.sector ? (
                                                    <span className="adm-badge">
                                                        {admin.sector}
                                                    </span>
                                                ) : (
                                                    <span className="adm-muted">
                                                        Unassigned
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span
                                                    className={`adm-status adm-status--${admin.status === "active" ? "active" : "inactive"
                                                        }`}
                                                >
                                                    {admin.status === "active" ? "Active" : admin.status}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    className="adm-link adm-link--edit"
                                                    onClick={() => openEditAdmin(admin)}
                                                >
                                                    <Edit2 size={12} /> Edit
                                                </button>{" "}
                                                <button
                                                    className="adm-link adm-link--delete"
                                                    onClick={() => handleDeleteAdmin(admin)}
                                                >
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Add Section Modal ── */}
                    {modal === "addSection" && (
                        <div className="adm-modal-overlay">
                            <div className="adm-modal" style={{ width: 440 }}>
                                <div className="adm-modal-header">
                                    <h3>
                                        <Plus size={18} /> Add New Section
                                    </h3>
                                    <button className="adm-modal-close" onClick={closeModal}>
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="adm-modal-body">
                                    {error && <div className="adm-error">{error}</div>}
                                    <label className="adm-label">Section Name</label>
                                    <input
                                        className="adm-input"
                                        value={sectionForm.name}
                                        onChange={(e) => setSectionForm({ name: e.target.value })}
                                        placeholder="e.g. Finance Section"
                                    />
                                    <div className="adm-modal-actions">
                                        <button className="adm-btn adm-btn--ghost" onClick={closeModal}>
                                            Cancel
                                        </button>
                                        <button
                                            className="adm-btn adm-btn--primary"
                                            onClick={submitAddSection}
                                            disabled={saving}
                                        >
                                            {saving ? "Creating…" : "Create Section"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Edit Section Modal ── */}
                    {modal === "editSection" && activeSection && (
                        <div className="adm-modal-overlay">
                            <div className="adm-modal" style={{ width: 460 }}>
                                <div className="adm-modal-header">
                                    <h3>Edit Admin Section</h3>
                                    <button className="adm-modal-close" onClick={closeModal}>
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="adm-modal-body">
                                    {error && <div className="adm-error">{error}</div>}
                                    <label className="adm-label">Section Name</label>
                                    <input
                                        className="adm-input"
                                        value={sectionForm.name}
                                        onChange={(e) => setSectionForm({ name: e.target.value })}
                                    />

                                    <label className="adm-label" style={{ marginTop: 16 }}>
                                        Assign Section In-charge
                                    </label>
                                    <div className="adm-checkbox-list">
                                        {admins.length === 0 ? (
                                            <div className="adm-muted">No admins available yet</div>
                                        ) : (
                                            admins.map((a) => (
                                                <label key={a.id} className="adm-checkbox-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={inchargeChoice === a.id}
                                                        onChange={() =>
                                                            setInchargeChoice((prev) =>
                                                                prev === a.id ? "" : a.id,
                                                            )
                                                        }
                                                    />
                                                    {a.name}
                                                </label>
                                            ))
                                        )}
                                    </div>

                                    <div className="adm-modal-actions">
                                        <button className="adm-btn adm-btn--ghost" onClick={closeModal}>
                                            Cancel
                                        </button>
                                        <button
                                            className="adm-btn adm-btn--primary"
                                            onClick={submitEditSection}
                                            disabled={saving}
                                        >
                                            {saving ? "Saving…" : "Update Section"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Add Incharge Modal (from section card button) ── */}
                    {modal === "addIncharge" && activeSection && (
                        <div className="adm-modal-overlay">
                            <div className="adm-modal" style={{ width: 420 }}>
                                <div className="adm-modal-header">
                                    <h3>Add Incharge — {activeSection.name}</h3>
                                    <button className="adm-modal-close" onClick={closeModal}>
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="adm-modal-body">
                                    {error && <div className="adm-error">{error}</div>}
                                    <div className="adm-checkbox-list">
                                        {admins.length === 0 ? (
                                            <div className="adm-muted">No admins available yet</div>
                                        ) : (
                                            admins.map((a) => (
                                                <label key={a.id} className="adm-checkbox-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={inchargeChoice === a.id}
                                                        onChange={() =>
                                                            setInchargeChoice((prev) =>
                                                                prev === a.id ? "" : a.id,
                                                            )
                                                        }
                                                    />
                                                    {a.name}
                                                </label>
                                            ))
                                        )}
                                    </div>
                                    <div className="adm-modal-actions">
                                        <button className="adm-btn adm-btn--ghost" onClick={closeModal}>
                                            Cancel
                                        </button>
                                        <button
                                            className="adm-btn adm-btn--primary"
                                            onClick={submitAddIncharge}
                                            disabled={saving}
                                        >
                                            {saving ? "Saving…" : "Assign"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Add / Edit Admin Modal ── */}
                    {modal === "addAdmin" && (
                        <div className="adm-modal-overlay">
                            <div className="adm-modal" style={{ width: 620, maxHeight: "90vh" }}>
                                <div className="adm-modal-header">
                                    <h3>
                                        <Plus size={18} />{" "}
                                        {editingAdminId ? "Edit Admin" : "Add New Admin"}
                                    </h3>
                                    <button className="adm-modal-close" onClick={closeModal}>
                                        <X size={16} />
                                    </button>
                                </div>
                                <div className="adm-modal-body adm-modal-body--scroll">
                                    {error && <div className="adm-error">{error}</div>}

                                    {/* <div className="adm-section-heading">
                                        System Role &amp; Sector Designation
                                    </div>
                                    <label className="adm-label">Assign to Sector / Access Level</label>
                                    <select
                                        className="adm-input"
                                        value={adminForm.sector}
                                        onChange={(e) => handleSectorChange(e.target.value)}
                                    >
                                        <option value="">Select a sector…</option>
                                        {sections.map((s) => (
                                            <option key={s.id} value={s.name}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select> */}

                                    <div className="adm-section-heading">
                                        System Role &amp; Sector Designation
                                    </div>

                                    <label className="adm-label">
                                        Assign to Sector / Access Level
                                    </label>

                                    <div className="adm-checkbox-list">
                                        {sections.map((section) => (
                                            <label key={section.id} className="adm-checkbox-row">
                                                <input
                                                    type="checkbox"
                                                    // checked={adminForm.sectors.includes(section.name)}
                                                    checked={(adminForm.sectors || []).includes(section.name)}
                                                    onChange={() => handleSectorChange(section.name)}
                                                />
                                                {section.name}
                                            </label>
                                        ))}
                                    </div>

                                    <div className="adm-section-heading" style={{ marginTop: 16 }}>
                                        Administrative Powers
                                    </div>
                                    {/* {!adminForm.sector ? ( */}
                                    {adminForm.sectors.length === 0 ? (
                                        <div className="adm-muted">
                                            Select a sector above to see its available powers.
                                        </div>
                                    ) : (
                                        <div className="adm-permission-grid">
                                            {/* {PERMISSIONS.filter((p) =>
                                                (SECTOR_DEFAULT_PERMISSIONS[adminForm.sector] || []).includes(
                                                    p.key,
                                                ), */}
                                            {PERMISSIONS.filter((p) =>
                                                adminForm.sectors.some((sector) =>
                                                    (SECTOR_DEFAULT_PERMISSIONS[sector] || []).includes(p.key)
                                                )
                                            ).map((p) => (
                                                <label key={p.key} className="adm-checkbox-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={adminForm.permissions.includes(p.key)}
                                                        onChange={() => togglePermission(p.key)}
                                                    />
                                                    {p.label}
                                                </label>
                                            ))}
                                        </div>
                                    )}

                                    <div className="adm-section-heading" style={{ marginTop: 16 }}>
                                        Personal Information
                                    </div>
                                    <div className="adm-form-grid-2">
                                        <div>
                                            <label className="adm-label">Name</label>
                                            <input
                                                className="adm-input"
                                                value={adminForm.name}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({ ...p, name: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="adm-label">Employee ID</label>
                                            <input
                                                className="adm-input"
                                                value={adminForm.employeeId}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({
                                                        ...p,
                                                        employeeId: e.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="adm-label">Phone</label>
                                            <input
                                                className="adm-input"
                                                value={adminForm.phone}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({ ...p, phone: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="adm-label">Email</label>
                                            <input
                                                className="adm-input"
                                                type="email"
                                                value={adminForm.email}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({ ...p, email: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="adm-label">Role Header (e.g. Master)</label>
                                            <input
                                                className="adm-input"
                                                placeholder="e.g. Dept Admin"
                                                value={adminForm.roleHeader}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({
                                                        ...p,
                                                        roleHeader: e.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="adm-label">Department</label>
                                            <input
                                                className="adm-input"
                                                value={adminForm.department}
                                                onChange={(e) =>
                                                    setAdminForm((p) => ({
                                                        ...p,
                                                        department: e.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="adm-credentials-box">
                                        <div className="adm-section-heading">Web Login Credentials</div>
                                        <div className="adm-form-grid-2">
                                            <div>
                                                <label className="adm-label">Web Login ID</label>
                                                <input
                                                    className="adm-input"
                                                    value={adminForm.loginId}
                                                    onChange={(e) =>
                                                        setAdminForm((p) => ({
                                                            ...p,
                                                            loginId: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <label className="adm-label">Password</label>
                                                <input
                                                    className="adm-input"
                                                    type="password"
                                                    placeholder={
                                                        editingAdminId ? "Leave blank to keep current" : ""
                                                    }
                                                    value={adminForm.password}
                                                    onChange={(e) =>
                                                        setAdminForm((p) => ({
                                                            ...p,
                                                            password: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="adm-modal-actions">
                                        <button className="adm-btn adm-btn--ghost" onClick={closeModal}>
                                            Cancel
                                        </button>
                                        <button
                                            className="adm-btn adm-btn--primary"
                                            onClick={submitAdminForm}
                                            disabled={saving}
                                        >
                                            {saving ? "Saving…" : "Save Profile Details"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </main>
            <ConfirmDialog
                open={!!confirmDelete}
                title={
                    confirmDelete?.type === "section"
                        ? `Delete "${confirmDelete.item.name}"?`
                        : `Delete admin "${confirmDelete?.item?.name}"?`
                }
                message={
                    confirmDelete?.type === "section"
                        ? "This will remove the section and its incharge assignment. This cannot be undone."
                        : "This will revoke their admin access and cannot be undone."
                }
                onConfirm={runConfirmedDelete}
                onCancel={() => setConfirmDelete(null)}
            />
        </div>
    );
};

export default Admins;