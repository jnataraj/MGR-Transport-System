import React, { useState, useEffect, useCallback } from "react";
import { UserCog, Plus, Edit, Trash2, Info, X, Eye, EyeOff } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import Modal from "../../components/Modal";
import { fetchUsers, createUser, updateUser, fetchVehicles, fetchLiveVehicles, socket, deleteUser, } from "../../api";
import "./Drivers.css";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { handleImageChange } from "../../components/imageResize";

const getStatusStyles = (status) => {
  const value = status?.toLowerCase();

  if (value === "active") {
    return {
      bg: "#D1FAE5",
      text: "#059669",
    };
  }

  if (value === "offline") {
    return {
      bg: "#E5E7EB",
      text: "#6B7280",
    };
  }

  if (value === "maintenance") {
    return {
      bg: "#FEF3C7",
      text: "#D97706",
    };
  }

  return {
    bg: "#F3F4F6",
    text: "#374151",
  };
};

const isDriverLive = (user, liveVehicles) => {
  if (!user || !liveVehicles || liveVehicles.size === 0) return false;
  return (
    liveVehicles.has(user.id) ||
    liveVehicles.has(user.vehicle) ||
    user.vehicleIds?.some((id) => liveVehicles.has(id)) ||
    (user.vehicles || []).some((v) => liveVehicles.has(v.id) || liveVehicles.has(v.number))
  );
};

const Drivers = () => {
  const [data, setData] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [liveVehicles, setLiveVehicles] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDetailPassword, setShowDetailPassword] = useState(true);
  // const [imagePreview, setImagePreview] = useState("");
  // const [imageError, setImageError] = useState("");

  const loadDrivers = useCallback(async () => {
    try {
      const [drivers, liveList] = await Promise.all([
        fetchUsers("driver"),
        fetchLiveVehicles(),
      ]);
      if (Array.isArray(liveList)) {
        setLiveVehicles(new Set(liveList));
      }
      const mapped = drivers.map((d) => formatDriver(d));
      setData(mapped);
    } catch (error) {
      console.error("Error loading drivers:", error);
    }
  }, []);

  useEffect(() => {
    const onLive = (d) => {
      const vId = d.vehicleId || d.id;
      const num = d.number;
      const drvId = d.driverId || d.userId;
      setLiveVehicles((prev) => {
        const next = new Set(prev);
        if (vId) next.add(vId);
        if (num) next.add(num);
        if (drvId) next.add(drvId);
        return next;
      });
    };
    const onStopped = (d) => {
      const vId = d.vehicleId || d.id;
      const num = d.number;
      const drvId = d.driverId || d.userId;
      setLiveVehicles((prev) => {
        const next = new Set(prev);
        if (vId) next.delete(vId);
        if (num) next.delete(num);
        if (drvId) next.delete(drvId);
        return next;
      });
    };
    const refresh = () => loadDrivers();

    socket.on("busLocationChanged", onLive);
    socket.on("busLocationStopped", onStopped);
    socket.on("userUpdated", refresh);
    socket.on("vehicleMembersUpdated", refresh);
    socket.on("attendance_scanned", refresh);
    return () => {
      socket.off("busLocationChanged", onLive);
      socket.off("busLocationStopped", onStopped);
      socket.off("userUpdated", refresh);
      socket.off("vehicleMembersUpdated", refresh);
      socket.off("attendance_scanned", refresh);
    };
  }, [loadDrivers]);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadDrivers, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadDrivers]);

  // useEffect(() => {
  //   console.log("Selected Staff:", selectedStaff);
  // }, [selectedStaff]);

  const formatDriver = (d) => ({
    id: d.id,
    name: d.name || "Unnamed",
    phone: d.phone || "",
    vehicle: d.vehicle || "Not Assigned",
    vehicleIds: d.vehicleIds || (d.vehicles ? d.vehicles.map((v) => v.id) : []),
    // status: d.status || "Active",
    status: d.status || "Offline",
    details: {
      employeeId: d.workId || d.employeeId || d.details?.employeeId || (d.id ? d.id.toString().slice(-8).toUpperCase() : "N/A"),
      licenseNumber: d.licenseNumber || d.license || d.details?.licenseNumber || "N/A",
      licenseExpiry: d.licenseExpiry || d.details?.licenseExpiry || "N/A",
      experience: d.experience || d.details?.experience || "N/A",
      address: d.address || d.homeAddress || d.details?.address || "N/A",
      image: d.image || d.details?.image || `https://i.pravatar.cc/150?u=${d.id}`,
      staffType: d.staffType || d.details?.staffType || "Driver",
      loginId: d.loginId || d.email || d.details?.loginId || "",
      password: d.password || d.plainPassword || d.details?.password || d.details?.plainPassword || "",
      shiftData: d.shiftData || d.details?.shiftData || {},
    },
  });

  const handleSave = async (driverData) => {
    try {
      if (editDriver) {
        const payload = {
          ...driverData,
          role: "DRIVER",
          loginId: driverData.loginId,
          email: driverData.loginId
            ? (driverData.loginId.includes("@") ? driverData.loginId : `${driverData.loginId}@ctms.local`)
            : editDriver.details.loginId,
        };

        // Don't update password if it's blank
        if (!payload.password || payload.password.trim() === "") {
          delete payload.password;
        }

        const updatedUser = await updateUser(editDriver.id, payload);

        const updatedDriver = formatDriver({
          ...updatedUser,
          password: payload.password || editDriver.details.password || updatedUser.password,
        });

        setData((prev) =>
          prev.map((d) => (d.id === updatedDriver.id ? updatedDriver : d))
        );

        if (selectedStaff?.id === updatedDriver.id) {
          setSelectedStaff(updatedDriver);
        }
      } else {
        const newUser = await createUser({
          ...driverData,
          role: "DRIVER",
          status: "Offline",
          loginId: driverData.loginId,
          email: driverData.loginId
            ? (driverData.loginId.includes("@") ? driverData.loginId : `${driverData.loginId}@ctms.local`)
            : undefined,
          password: driverData.password,
        });

        const createdDriver = formatDriver({
          ...newUser,
          password: driverData.password || newUser.password,
        });

        setData((prev) => [...prev, createdDriver]);
      }

      setIsModalOpen(false);
      setEditDriver(null);
    } catch (error) {
      console.error("Error saving driver:", error);
    }
  };
  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  const confirmDeleteDriver = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      if (selectedStaff?.id === deleteTarget.id) setSelectedStaff(null);
    } catch (error) {
      console.error("Error deleting driver:", error);
      alert(error.message || "Unable to delete driver.");
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
          <div className="dr-page-header">
            <h1>Driver & Staff Management</h1>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditDriver(null);
                setIsModalOpen(true);
              }}
            >
              <Plus size={18} className="dr-btn-icon" /> Add Staff / Driver
            </button>
          </div>

          <div className="dr-table-card">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Phone</th>
                  <th>Assigned Vehicle</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((user) => (
                  <tr
                    key={user.id}
                    className={
                      "dr-table-row" +
                      (selectedStaff?.id === user.id
                        ? " dr-table-row--selected"
                        : "")
                    }
                    onClick={() => setSelectedStaff(user)}
                  >
                    <td className="dr-td-name">
                      <UserCog size={18} color="#9333EA" /> {user.name}
                    </td>
                    <td className="dr-td-muted">{user.phone}</td>
                    <td className="dr-td-vehicle">{user.vehicle}</td>
                    <td>
                      {(() => {
                        const live = isDriverLive(user, liveVehicles);

                        return (
                          <>
                            <span
                              className={
                                "dr-status-badge " +
                                (live
                                  ? "dr-status-badge--active"
                                  : "dr-status-badge--inactive")
                              }
                            >
                              {live ? "Active" : "Offline"}
                            </span>

                            {live && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  fontSize: 9,
                                  fontWeight: 900,
                                  color: "#059669",
                                  backgroundColor: "#D1FAE5",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                🟢 ON DUTY
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td
                      className="dr-td-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="dr-action-edit"
                        onClick={() => {
                          setEditDriver(user);
                          setIsModalOpen(true);
                        }}
                      >
                        <Edit size={16} /> Edit
                      </button>
                      <button
                        className="dr-action-delete"
                        onClick={() => setDeleteTarget(user)}
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedStaff && (
            <div className="dr-detail-panel">
              <button
                onClick={() => setSelectedStaff(null)}
                className="dr-detail-close"
              >
                <X size={20} />
              </button>
              <h3 className="dr-detail-title">
                <Info size={22} color="#9333EA" /> Staff Master Records:{" "}
                {selectedStaff.name}
              </h3>

              <div className="dr-detail-body">
                {selectedStaff.details.image && (
                  <img
                    src={selectedStaff.details.image}
                    alt="Staff Avatar"
                    className="dr-detail-image"
                  />
                )}
                <div className="dr-detail-grid">
                  {/* General Profile Section */}
                  <div className="dr-sechead dr-sechead--profile">
                    Employment Profile
                  </div>
                  <strong className="dr-detail-label">Registered Phone:</strong>{" "}
                  <span className="dr-detail-value">{selectedStaff.phone}</span>
                  <strong className="dr-detail-label">Employee ID:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.employeeId}
                  </span>
                  <strong className="dr-detail-label">Employee Mail Id:</strong>{" "}
                  <span className="dr-detail-value">
                    {/* {selectedStaff.details.email} */}
                    {selectedStaff.details.email || "Not Available"}
                  </span>
                  <strong className="dr-detail-label">License Number:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.licenseNumber}
                  </span>
                  <strong className="dr-detail-label">License Expiry:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.licenseExpiry}
                  </span>
                  <strong className="dr-detail-label">Work Experience:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.experience}
                  </span>
                  <strong className="dr-detail-label">
                    Residential Address:
                  </strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.address}
                  </span>
                  <strong className="dr-detail-label">Staff Type:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.staffType || "Driver"}
                  </span>
                  {/* Login Credentials Section */}
                  <div className="dr-sechead dr-sechead--login">
                    App Login Credentials
                  </div>
                  <strong className="dr-detail-label">Login ID:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.details.loginId || "Not Assigned"}
                  </span>
                  <strong className="dr-detail-label">Password:</strong>{" "}
                  <span className="dr-detail-value dr-detail-password-wrapper">
                    {selectedStaff.details.password ? (
                      <>
                        <span className="dr-detail-password-text">
                          {showDetailPassword ? selectedStaff.details.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="dr-password-toggle-btn"
                          title={showDetailPassword ? "Hide Password" : "Show Password"}
                        >
                          {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </>
                    ) : (
                      <span className="dr-detail-empty">Not Available</span>
                    )}
                  </span>
                  {/* Operational Section */}
                  <div className="dr-sechead dr-sechead--ops">
                    Operational Duty Details
                  </div>
                  <strong className="dr-detail-label">
                    Current Status:
                  </strong>

                  <span
                    className="dr-detail-status"
                    style={{
                      color: getStatusStyles(
                        isDriverLive(selectedStaff, liveVehicles) ? "active" : "offline"
                      ).text,
                    }}
                  >
                    {isDriverLive(selectedStaff, liveVehicles) ? "Active" : "Offline"}
                  </span>
                  {isDriverLive(selectedStaff, liveVehicles) && (
                    <>
                      <strong className="dr-detail-label">Live GPS:</strong>
                      <span style={{ color: "#059669", fontWeight: 800 }}>🟢 Active — on duty</span>
                    </>
                  )}
                  <strong className="dr-detail-label">Assigned Vehicle:</strong>{" "}
                  <span className="dr-detail-value">
                    {selectedStaff.vehicle}
                  </span>
                  {Object.entries(selectedStaff.details.shiftData).map(
                    ([key, value]) => (
                      <React.Fragment key={key}>
                        <strong className="dr-detail-label">
                          {formatKey(key)}:
                        </strong>
                        <span className="dr-detail-shift-value">{value}</span>
                      </React.Fragment>
                    ),
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Add / Edit Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditDriver(null);
          }}
          title={editDriver ? "Edit Staff / Driver" : "Add Staff / Driver"}
        >
          <DriverForm
            driver={editDriver}
            onSave={handleSave}
            onCancel={() => {
              setIsModalOpen(false);
              setEditDriver(null);
            }}
          />
        </Modal>
        <ConfirmDialog
          open={!!deleteTarget}
          message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
          onConfirm={confirmDeleteDriver}
          onCancel={() => setDeleteTarget(null)}
          confirmLabel="Delete"
        />
      </main>
    </div>
  );
};

export default Drivers;

// DriverForm component (inline)
const DriverForm = ({ driver, onSave, onCancel }) => {
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);

  const emptyData = {
    id: "",
    name: "",
    phone: "",
    vehicle: "",
    vehicleIds: [],
    // status: "Active",
    status: "Offline",
    workId: "",
    staffType: "Driver",
    loginId: "",
    password: "",
  };

  const [formData, setFormData] = useState(emptyData);

  useEffect(() => {
    if (driver) {
      setFormData({
        id: driver.id,
        name: driver.name || "",
        phone: driver.phone || "",
        vehicle:
          driver.vehicle !== "Not Assigned"
            ? driver.vehicle
            : "",

        vehicleIds: driver.vehicleIds || [],
        status: driver.status || "Active",
        workId: driver.details?.employeeId || "",
        staffType: driver.details?.staffType || "Driver",
        loginId: driver.details?.loginId || "",
        password: driver.password || driver.details?.password || "",
      });
      // setImagePreview(driver.details?.image?.startsWith("data:") ? driver.details.image : "");
      setImagePreview(driver.details?.image || "");
      setImageError("");
    } else {
      setFormData(emptyData);
      setImagePreview("");
      setImageError("");
    }
  }, [driver]);

  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  // useEffect(() => {
  //   const timeoutId = window.setTimeout(() => {
  //     fetchVehicles()
  //       .then(setVehicles)
  //       .catch((error) => {
  //         console.error("Error loading vehicles:", error);
  //         setVehicles([]);
  //       })
  //       .finally(() => setLoadingVehicles(false));
  //   }, 0);
  //   return () => window.clearTimeout(timeoutId);
  // }, []);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const list = await fetchVehicles();
        setVehicles(list);

        // Preserve selected vehicle
        setFormData((prev) => {
          if (!prev.vehicle && (!prev.vehicleIds || prev.vehicleIds.length === 0)) return prev;

          const currentId = prev.vehicleIds?.[0];
          const matchedVehicle = list.find(
            (v) => v.id === currentId || v.number === prev.vehicle || v.id === prev.vehicle
          );

          if (matchedVehicle) {
            return {
              ...prev,
              vehicle: matchedVehicle.number,
              vehicleIds: [matchedVehicle.id],
            };
          } else {
            return { ...prev, vehicle: "", vehicleIds: [] };
          }
        });
      } catch (err) {
        console.error(err);
        setVehicles([]);
      } finally {
        setLoadingVehicles(false);
      }
    };

    loadVehicles();
  }, [driver]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVehicleChange = (e) => {
    const val = e.target.value;
    const matched = vehicles.find((v) => v.id === val);
    setFormData((prev) => ({
      ...prev,
      vehicle: matched ? matched.number : "",
      vehicleIds: val ? [val] : [],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // onSave(formData);
    onSave({ ...formData, image: imagePreview || undefined });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Designation Section */}
      <div className="dr-form-section">
        <h3 className="dr-form-section-title">System Role & Designation</h3>
        <div className="dr-form-full">
          <label className="dr-form-label">Staff Designation</label>
          <select
            name="staffType"
            value={formData.staffType || ""}
            onChange={handleChange}
            required
            className="dr-form-input"
          >
            <option value="">Select Designation</option>
            <option value="Driver">Bus Driver</option>
            <option value="Maintenance Team">Maintenance Team</option>
            <option value="Helper">Staff Helper</option>
            <option value="Mechanic">Mechanic</option>
          </select>
        </div>
      </div>

      {/* Personal Information Section */}
      <div className="dr-form-section">
        <h3 className="dr-form-section-title">Personal Information</h3>
        <div className="dr-form-row">
          <div className="dr-form-col">
            <label className="dr-form-label">Staff Name</label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="dr-form-input"
            />
          </div>
          <div className="dr-form-col">
            <label className="dr-form-label">Work ID Number</label>
            <input
              name="workId"
              value={formData.workId || ""}
              onChange={handleChange}
              required
              className="dr-form-input"
            />
          </div>
        </div>
        <div className="dr-form-field">
          <label className="dr-form-label">Phone</label>
          <input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className="dr-form-input"
          />
        </div>
        {/* <div>
          <label className="dr-form-label">Profile Image (JPG)</label>
          <input
            name="imageFile"
            type="file"
            accept="image/jpeg"
            className="dr-form-file"
          />
        </div> */}
        <div>
          <label className="dr-form-label">Profile Image (JPG)</label>
          <input
            name="imageFile"
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => handleImageChange(e.target.files[0], setImagePreview, setImageError)}
            className="dr-form-file"
          />
          {imageError && <div style={{ color: "#DC2626", fontSize: 12, marginTop: 4 }}>{imageError}</div>}
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Preview"
              style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", marginTop: 8, border: "1px solid #e2e8f0" }}
            />
          )}
        </div>
      </div>

      {/* Operational Section */}
      <div className="dr-form-section">
        <h3 className="dr-form-section-title">Operational Status</h3>
        <div className="dr-form-row">
          <div className="dr-form-col">
            <label className="dr-form-label">Assigned Vehicle</label>
            <select
              name="vehicle"
              value={formData.vehicleIds[0] || ""}
              onChange={handleVehicleChange}
              className="dr-form-input"
            >
              <option value="">
                {loadingVehicles ? "Loading vehicles…" : "Not Assigned"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.number} {v.route ? `— ${v.route}` : ""}
                </option>
              ))}
            </select>
          </div>
          {/* <div className="dr-form-col">
            <label className="dr-form-label">Current Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="dr-form-input"
            >
              <option value="Active">Active</option>
              <option value="Off Duty">Off Duty</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div> */}
          <div className="dr-form-col">
            <label className="dr-form-label">Current Status</label>

            <div
              className="dr-form-input"
              style={{
                display: "flex",
                alignItems: "center",
                fontWeight: 700,
                color:
                  formData.status === "Active"
                    ? "#059669"
                    : "#6B7280",
              }}
            >
              {formData.status === "Active" ? "Active" : "Offline"}
            </div>
          </div>
        </div>
      </div>

      {/* Login Credentials Section */}
      <div className="dr-form-credentials">
        <h3 className="dr-form-credentials-title">App Login Credentials</h3>
        <div className="dr-form-row">
          <div className="dr-form-col">
            <label className="dr-form-label">App Login ID</label>
            <input
              name="loginId"
              value={formData.loginId || ""}
              onChange={handleChange}
              required
              className="dr-form-input"
            />
          </div>
          <div className="dr-form-col">
            <label className="dr-form-label">App Password</label>
            <div className="dr-password-input-wrapper">
              <input
                name="password"
                type={showFormPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                placeholder={
                  driver ? "Leave blank to keep current password" : "Enter password"
                }
                required={!driver}
                className="dr-form-input"
              />
              <button
                type="button"
                onClick={() => setShowFormPassword((prev) => !prev)}
                className="dr-password-input-eye"
                title={showFormPassword ? "Hide Password" : "Show Password"}
              >
                {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="dr-form-buttons">
        <button type="button" onClick={onCancel} className="dr-btn-cancel">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary dr-btn-submit">
          Save Staff
        </button>
      </div>
    </form>
  );
};
