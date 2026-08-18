import { useState, useEffect } from "react";
import { Component, Plus, Edit, Trash2, Info, X, Eye, EyeOff } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchUsers, createUser, updateUser, deleteUser } from "../../api";
import "./Coordinator.css";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { handleImageChange } from "../../components/imageResize";

// frontend view model helpers
const mapUserToVM = (u) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role || "Coordinator",
  title: u.title || "",
  status: u.status || "Active",
  image: u.image || `https://i.pravatar.cc/150?u=${u.id}`,
  details: {
    email: u.email,
    location: u.location || "",
    shift: u.shift || "",
    joinedDate: u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "",
    image: `https://i.pravatar.cc/150?u=${u.id}`,
    loginId: u.loginId || u.email || "",
    password: u.password || u.plainPassword || "",
  },
});

const Coordinators = () => {
  const [data, setData] = useState([]);
  const [selectedCoordinator, setSelectedCoordinator] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCoordinator, setEditCoordinator] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [showDetailPassword, setShowDetailPassword] = useState(true);
  const [showCoordModalPassword, setShowCoordModalPassword] = useState(false);

  const loadCoordinators = async () => {
    try {
      const users = await fetchUsers("coordinator");
      setData(users.map(mapUserToVM));
    } catch (err) {
      console.error("Failed to load coordinators", err);
    }
  };

  useEffect(() => {
    const fetchCoordinators = async () => {
      await loadCoordinators();
    };
    fetchCoordinators();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      role: formData.get("role") || "coordinator",
      title: formData.get("title"),
      email: formData.get("email"),
      location: formData.get("location"),
      shift: formData.get("shift"),
      password: formData.get("password"),
      image: imagePreview || undefined,
    };

    try {
      if (editCoordinator) {
        const updated = await updateUser(editCoordinator.id, payload);
        setData((prev) =>
          prev.map((c) => (c.id === updated.id ? mapUserToVM(updated) : c)),
        );
        setSelectedCoordinator(mapUserToVM(updated));
      } else {
        const created = await createUser(payload);
        setData((prev) => [...prev, mapUserToVM(created)]);
      }
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setShowAddModal(false);
      setEditCoordinator(null);
    }
  };

  const confirmDeleteCoordinator = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setData((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      if (selectedCoordinator?.id === deleteTarget.id) setSelectedCoordinator(null);
    } catch (err) {
      console.error("Delete failed", err);
      alert(err.message || "Unable to delete coordinator.");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />

        <section className="page-content">
          <div className="coord-page-header">
            <h1>Coordinator Management</h1>
            <button
              className="btn btn-primary coord-btn-add"
              onClick={() => {
                setEditCoordinator(null);
                setImagePreview("");
                setImageError("");
                setShowAddModal(true);
              }}
            >
              <Plus size={18} /> Add Coordinator
            </button>
          </div>

          {showAddModal && (
            <div className="coord-modal-overlay">
              <div className="coord-modal">
                <div className="coord-modal-header">
                  {editCoordinator ? (
                    <Edit size={22} color="var(--primary)" />
                  ) : (
                    <Plus size={22} color="var(--primary)" />
                  )}
                  <h2>
                    {editCoordinator
                      ? "Edit Coordinator"
                      : "Add New Coordinator"}
                  </h2>
                </div>

                <form
                  id="coordinator-form"
                  onSubmit={handleSave}
                  className="coord-modal-body"
                >
                  {/* Designation Section */}
                  <div className="coord-form-section">
                    <h3>System Role & Designation</h3>
                    <div className="coord-field">
                      <label>Assigned Designation</label>
                      <input type="text" value="Coordinator" disabled />
                    </div>
                  </div>

                  {/* Personal Information Section */}
                  <div className="coord-form-section">
                    <h3>Personal Information</h3>

                    <div className="coord-form-row">
                      <div className="coord-field">
                        <label>Name</label>
                        <input
                          name="name"
                          type="text"
                          placeholder="e.g. Priya Nair"
                          defaultValue={editCoordinator?.name || ""}
                          required
                        />
                      </div>
                      <div className="coord-field">
                        <label>Work ID Number</label>
                        <input
                          name="workId"
                          type="text"
                          placeholder="e.g. C-1042"
                          defaultValue={editCoordinator?.id || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="coord-form-row">
                      <div className="coord-field">
                        <label>Phone</label>
                        <input
                          name="phone"
                          type="text"
                          placeholder="e.g. 98765 43210"
                          defaultValue={editCoordinator?.phone || ""}
                          required
                        />
                      </div>
                      <div className="coord-field">
                        <label>Email</label>
                        <input
                          name="email"
                          type="email"
                          placeholder="coordinator@school.edu"
                          defaultValue={editCoordinator?.details?.email || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="coord-field">
                      <label>Profile Image (JPG)</label>
                      <input
                        name="imageFile"
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setImageProcessing(true);
                          handleImageChange(file, (val) => {
                            setImagePreview(val);
                            setImageProcessing(false);
                          }, (err) => {
                            setImageError(err);
                            setImageProcessing(false);
                          });
                        }}
                      />
                      {imageError && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 4 }}>{imageError}</div>}
                      {imagePreview && (
                        <img src={imagePreview} alt="Preview" style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", marginTop: 8, border: "1px solid #e2e8f0" }} />
                      )}
                    </div>
                  </div>

                  {/* Operational Section */}
                  <div className="coord-form-section">
                    <h3>Operational Details</h3>

                    <div className="coord-field">
                      <label>Role / Title</label>
                      <input
                        name="role"
                        type="text"
                        placeholder="e.g. Area Coordinator"
                        defaultValue={editCoordinator?.role || ""}
                        required
                      />
                    </div>

                    <div className="coord-form-row">
                      <div className="coord-field">
                        <label>Location</label>
                        <input
                          name="location"
                          type="text"
                          placeholder="e.g. North Campus"
                          defaultValue={
                            editCoordinator?.details?.location || ""
                          }
                          required
                        />
                      </div>
                      <div className="coord-field">
                        <label>Shift</label>
                        <input
                          name="shift"
                          type="text"
                          placeholder="e.g. Morning"
                          defaultValue={editCoordinator?.details?.shift || ""}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Login Credentials Section */}
                  <div className="coord-form-section credentials">
                    <h3>App Login Credentials</h3>
                    <div className="coord-form-row">
                      <div className="coord-field">
                        <label>App Login ID</label>
                        <input
                          name="loginId"
                          type="text"
                          placeholder="coordinator@school.edu"
                          defaultValue={editCoordinator?.details?.loginId || ""}
                          required
                        />
                      </div>
                      <div className="coord-field">
                        <label>App Password</label>
                        <div className="coord-password-input-wrapper">
                          <input
                            name="password"
                            type={showCoordModalPassword ? "text" : "password"}
                            placeholder="Set a login password"
                            defaultValue={
                              editCoordinator?.details?.password || ""
                            }
                            required={!editCoordinator}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCoordModalPassword(!showCoordModalPassword)}
                            className="coord-password-input-eye"
                            title={showCoordModalPassword ? "Hide Password" : "Show Password"}
                          >
                            {showCoordModalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="coord-modal-footer">
                  <button
                    type="button"
                    className="coord-btn-cancel"
                    onClick={() => {
                      // setShowAddModal(false);
                      // setEditCoordinator(null);
                      setEditCoordinator(null);
                      setImagePreview("");
                      setImageError("");
                      setShowAddModal(false);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    form="coordinator-form"
                    className="btn btn-primary coord-btn-save"
                    disabled={imageProcessing}
                  >
                    {imageProcessing ? "Processing image…" : "Save Coordinator"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="coord-table-card">
            <div className="coord-table-scroll">
              <table className="coord-table">
                <thead>
                  <tr>
                    <th>Coordinator Name</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr className="coord-empty-row">
                      <td colSpan={5}>No coordinators found yet.</td>
                    </tr>
                  ) : (
                    data.map((user) => (
                      <tr
                        key={user.id}
                        className={
                          selectedCoordinator?.id === user.id ? "selected" : ""
                        }
                        onClick={() => setSelectedCoordinator(user)}
                      >
                        <td>
                          <div className="coord-name-cell">
                            <Component size={18} color="var(--primary)" />
                            {user.name}
                          </div>
                        </td>
                        <td>{user.phone}</td>
                        <td>{user.role}</td>
                        <td>
                          <span
                            className={`coord-status-badge ${user.status === "Active"
                              ? "coord-status-active"
                              : "coord-status-inactive"
                              }`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td
                          className="coord-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="coord-action-btn coord-action-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditCoordinator(user);
                              setImagePreview(user.image?.startsWith("data:") ? user.image : "");
                              setImageError("");
                              setShowAddModal(true);
                            }}
                          >
                            <Edit size={16} /> Edit
                          </button>
                          <button
                            className="coord-action-btn coord-action-delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(user);
                            }}
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedCoordinator && (
            <div className="coord-detail-card">
              <button
                className="coord-detail-close"
                onClick={() => setSelectedCoordinator(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>

              <h3 className="coord-detail-title">
                <Info size={22} color="var(--primary)" /> Profile Details:{" "}
                {selectedCoordinator.name}
              </h3>

              <div className="coord-detail-body">
                {selectedCoordinator.image && (
                  <img
                    src={selectedCoordinator.image}
                    alt="Avatar"
                    className="coord-detail-avatar"
                  />
                )}
                <div className="coord-detail-grid">
                  <strong>Email Address:</strong>
                  <span>{selectedCoordinator.details.email}</span>
                  <strong>Contact Phone:</strong>
                  <span>{selectedCoordinator.phone}</span>
                  <strong>System Role:</strong>
                  <span>{selectedCoordinator.role}</span>
                  <strong>Location:</strong>
                  <span>{selectedCoordinator.details.location}</span>
                  <strong>Shift:</strong>
                  <span>{selectedCoordinator.details.shift}</span>
                  <strong>Joined Date:</strong>
                  <span>{selectedCoordinator.details.joinedDate}</span>

                  {/* App Login Setup */}
                  <div className="coord-detail-section-label">
                    App Login Credentials
                  </div>
                  <strong>Login ID:</strong>
                  <span>
                    {selectedCoordinator.details.loginId || "Not Assigned"}
                  </span>
                  <strong>Password:</strong>
                  <span className="coord-detail-password-wrapper">
                    {selectedCoordinator.details.password ? (
                      <>
                        <span className="coord-detail-password-text">
                          {showDetailPassword ? selectedCoordinator.details.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="coord-password-toggle-btn"
                          title={showDetailPassword ? "Hide Password" : "Show Password"}
                        >
                          {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </>
                    ) : (
                      <span className="coord-detail-empty">Not Assigned</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message="This action cannot be undone."
        onConfirm={confirmDeleteCoordinator}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Coordinators;
