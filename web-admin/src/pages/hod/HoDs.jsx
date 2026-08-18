import { useState, useEffect } from "react";
import { Crown, Plus, Edit, Trash2, Info, X, Eye, EyeOff } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchUsers, createUser, updateUser, deleteUser } from "../../api";
import "./HoD.css"; // Adjust the import path as necessary
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { handleImageChange } from "../../components/imageResize";


const mapUserToVM = (u) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  department: u.department || "",
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

const HoDs = () => {
  const [data, setData] = useState([]);
  const [selectedHoD, setSelectedHoD] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editHoD, setEditHoD] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [showDetailPassword, setShowDetailPassword] = useState(true);
  const [showHoDModalPassword, setShowHoDModalPassword] = useState(false);

  const loadHoDs = async () => {
    try {
      const users = await fetchUsers("hod");
      setData(users.map(mapUserToVM));
    } catch (err) {
      console.error("Failed to load HoDs", err);
    }
  };

  useEffect(() => {
    // loadHoDs();
    const fetchHoDs = async () => {
      await loadHoDs();
    };
    fetchHoDs();
  }, []);

  const confirmDeleteHoD = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setData((prev) => prev.filter((h) => h.id !== deleteTarget.id));
      if (selectedHoD?.id === deleteTarget.id) setSelectedHoD(null);
    } catch (err) {
      console.error("Delete failed", err);
      alert(err.message || "Unable to delete HoD.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const payload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      role: "hod",
      department: formData.get("department"),
      email: formData.get("email"),
      location: formData.get("location"),
      shift: formData.get("shift"),
      password: formData.get("password"),
      image: imagePreview || undefined,
    };

    (async () => {
      try {
        if (editHoD) {
          const updated = await updateUser(editHoD.id, payload);
          setData((prev) =>
            prev.map((h) => (h.id === updated.id ? mapUserToVM(updated) : h)),
          );
          setSelectedHoD(mapUserToVM(updated));
        } else {
          const created = await createUser(payload);
          setData((prev) => [...prev, mapUserToVM(created)]);
        }
      } catch (err) {
        console.error("Save HoD failed", err);
      } finally {
        setShowAddModal(false);
        setEditHoD(null);
      }
    })();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />

        <section className="page-content">
          <div className="hod-page-header">
            <div>
              <h1 className="hod-page-title">
                <Crown size={28} color="#7C3AED" /> HoD Management
              </h1>
              <p className="hod-page-subtitle">
                Manage Head of Department accounts, login credentials, and
                department assignments
              </p>
            </div>
            <button
              className="btn btn-primary hod-btn-add"
              onClick={() => {
                setEditHoD(null);
                setImagePreview("");
                setImageError("");
                setShowAddModal(true);
              }}
            >
              <Plus size={18} /> Add HoD
            </button>
          </div>

          {showAddModal && (
            <div className="hod-modal-overlay">
              <div className="hod-modal">
                <div className="hod-modal-header">
                  {editHoD ? (
                    <Edit size={22} color="#7C3AED" />
                  ) : (
                    <Plus size={22} color="#7C3AED" />
                  )}
                  <h2>{editHoD ? "Edit HoD" : "Add New HoD"}</h2>
                </div>

                <form
                  id="hod-form"
                  onSubmit={handleSave}
                  className="hod-modal-body"
                >
                  {/* Designation Section */}
                  <div className="hod-form-section">
                    <h3>System Role & Designation</h3>
                    <div className="hod-field">
                      <label>Assigned Designation</label>
                      <input
                        type="text"
                        value="Head of Department (HoD)"
                        disabled
                      />
                    </div>
                  </div>

                  {/* Personal Information Section */}
                  <div className="hod-form-section">
                    <h3>Personal Information</h3>

                    <div className="hod-form-row">
                      <div className="hod-field">
                        <label>Name</label>
                        <input
                          name="name"
                          type="text"
                          placeholder="e.g. Dr. Meera Iyer"
                          defaultValue={editHoD?.name || ""}
                          required
                        />
                      </div>
                      <div className="hod-field">
                        <label>Work ID Number</label>
                        <input
                          name="workId"
                          type="text"
                          placeholder="e.g. H-2201"
                          defaultValue={editHoD?.id || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="hod-form-row">
                      <div className="hod-field">
                        <label>Phone</label>
                        <input
                          name="phone"
                          type="text"
                          placeholder="e.g. 98765 43210"
                          defaultValue={editHoD?.phone || ""}
                          required
                        />
                      </div>
                      <div className="hod-field">
                        <label>Email</label>
                        <input
                          name="email"
                          type="email"
                          placeholder="hod@school.edu"
                          defaultValue={editHoD?.details?.email || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="hod-field">
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
                  <div className="hod-form-section">
                    <h3>Operational Details</h3>

                    <div className="hod-field">
                      <label>Department</label>
                      <input
                        name="department"
                        type="text"
                        placeholder="e.g. Computer Science & Engineering"
                        defaultValue={editHoD?.department || ""}
                        required
                      />
                    </div>

                    <div className="hod-form-row">
                      <div className="hod-field">
                        <label>Location / Office</label>
                        <input
                          name="location"
                          type="text"
                          placeholder="e.g. Block C, Room 204"
                          defaultValue={editHoD?.details?.location || ""}
                          required
                        />
                      </div>
                      <div className="hod-field">
                        <label>Shift</label>
                        <input
                          name="shift"
                          type="text"
                          placeholder="e.g. Morning"
                          defaultValue={editHoD?.details?.shift || ""}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Login Credentials Section */}
                  <div className="hod-form-section credentials">
                    <h3>App Login Credentials</h3>
                    <div className="hod-form-row">
                      <div className="hod-field">
                        <label>App Login ID</label>
                        <input
                          name="loginId"
                          type="text"
                          placeholder="hod@school.edu"
                          defaultValue={editHoD?.details?.loginId || ""}
                          required
                        />
                      </div>
                      <div className="hod-field">
                        <label>App Password</label>
                        <div className="hod-password-input-wrapper">
                          <input
                            name="password"
                            type={showHoDModalPassword ? "text" : "password"}
                            placeholder="Set a login password"
                            defaultValue={editHoD?.details?.password || ""}
                            required={!editHoD}
                          />
                          <button
                            type="button"
                            onClick={() => setShowHoDModalPassword(!showHoDModalPassword)}
                            className="hod-password-input-eye"
                            title={showHoDModalPassword ? "Hide Password" : "Show Password"}
                          >
                            {showHoDModalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="hod-modal-footer">
                  <button
                    type="button"
                    className="hod-btn-cancel"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditHoD(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="hod-form"
                    className="btn btn-primary hod-btn-save"
                    disabled={imageProcessing}
                  >
                    {imageProcessing ? "Processing image…" : "Save HoD"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="hod-table-card">
            <div className="hod-table-scroll">
              <table className="hod-table">
                <thead>
                  <tr>
                    <th>HoD Name</th>
                    <th>Phone</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr className="hod-empty-row">
                      <td colSpan={5}>No HoDs found yet.</td>
                    </tr>
                  ) : (
                    data.map((user) => (
                      <tr
                        key={user.id}
                        className={
                          selectedHoD?.id === user.id ? "selected" : ""
                        }
                        onClick={() => setSelectedHoD(user)}
                      >
                        <td>
                          <div className="hod-name-cell">
                            <Crown size={18} color="#7C3AED" />
                            {user.name}
                          </div>
                        </td>
                        <td>{user.phone}</td>
                        <td>{user.department}</td>
                        <td>
                          <span
                            className={`hod-status-badge ${user.status === "Active"
                              ? "hod-status-active"
                              : "hod-status-inactive"
                              }`}
                          >
                            {user.status}
                          </span>
                        </td>
                        <td
                          className="hod-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="hod-action-btn hod-action-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditHoD(user);
                              setImagePreview(user.image?.startsWith("data:") ? user.image : "");
                              setImageError("");
                              setShowAddModal(true);
                            }}
                          >
                            <Edit size={16} /> Edit
                          </button>
                          <button
                            className="hod-action-btn hod-action-delete"
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

          {selectedHoD && (
            <div className="hod-detail-card">
              <button
                className="hod-detail-close"
                onClick={() => setSelectedHoD(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>

              <h3 className="hod-detail-title">
                <Info size={22} color="#7C3AED" /> Profile Details:{" "}
                {selectedHoD.name}
              </h3>

              <div className="hod-detail-body">
                {selectedHoD.image && (
                  <img
                    src={selectedHoD.image}
                    alt="Avatar"
                    className="hod-detail-avatar"
                  />
                )}
                <div className="hod-detail-grid">
                  <strong>Email Address:</strong>
                  <span>{selectedHoD.details.email}</span>
                  <strong>Contact Phone:</strong>
                  <span>{selectedHoD.phone}</span>
                  <strong>Department:</strong>
                  <span>{selectedHoD.department}</span>
                  <strong>Office Location:</strong>
                  <span>{selectedHoD.details.location}</span>
                  <strong>Shift:</strong>
                  <span>{selectedHoD.details.shift}</span>
                  <strong>Joined Date:</strong>
                  <span>{selectedHoD.details.joinedDate}</span>

                  {/* App Login Setup */}
                  <div className="hod-detail-section-label">
                    App Login Credentials
                  </div>
                  <strong>Login ID:</strong>
                  <span>{selectedHoD.details.loginId || "Not Assigned"}</span>
                  <strong>Password:</strong>
                  <span className="hod-detail-password-wrapper">
                    {selectedHoD.details.password ? (
                      <>
                        <span className="hod-detail-password-text">
                          {showDetailPassword ? selectedHoD.details.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="hod-password-toggle-btn"
                          title={showDetailPassword ? "Hide Password" : "Show Password"}
                        >
                          {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </>
                    ) : (
                      <span className="hod-detail-empty">Not Assigned</span>
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
        onConfirm={confirmDeleteHoD}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default HoDs;
