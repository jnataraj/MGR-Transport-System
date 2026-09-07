import React, { useState, useEffect } from "react";
import { GraduationCap, Plus, Edit, Trash2, Info, X, Eye, EyeOff, BusFront, AlertTriangle, MapPin } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchUsers, createUser, fetchVehicles, updateUser, assignStudentBus, socket, deleteUser } from "../../api";
import "./Student.css";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { handleImageChange } from "../../components/imageResize";


const getPaymentStyles = (status) => {
  if (status === "Paid") return { bg: "#D1FAE5", text: "#065F46" };
  if (status === "Pending") return { bg: "#FEF3C7", text: "#D97706" };
  if (status === "Issue") return { bg: "#FEE2E2", text: "#DC2626" };
  return { bg: "#F3F4F6", text: "#374151" };
};

const Students = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [showDetailPassword, setShowDetailPassword] = useState(true);
  const [showStudentModalPassword, setShowStudentModalPassword] = useState(false);

  // Transport details modal form states
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [pickupPoint, setPickupPoint] = useState("");

  const mapUserToRow = (user, extras = {}) => {
    const rawImage = user.image || null;
    const image = user.image || `https://i.pravatar.cc/150?u=${user.id}`;

    // Collect all assigned vehicles from studentAssignments or vehicles array
    let assignedVehicles = [];

    if (Array.isArray(user.studentAssignments) && user.studentAssignments.length > 0) {
      assignedVehicles = user.studentAssignments
        .map((a) => {
          const v = a.vehicle || {};
          return {
            id: a.vehicleId || v.id || "",
            number: v.number || a.vehicleNumber || "",
            route: v.route || a.route || "",
            pickupPoint: a.pickupPoint || user.pickupPoint || user.location || "",
          };
        })
        .filter((v) => v.number && v.number !== "Not Assigned" && v.number !== "");
    }

    if (assignedVehicles.length === 0 && Array.isArray(user.vehicles) && user.vehicles.length > 0) {
      assignedVehicles = user.vehicles
        .map((v) => ({
          id: v.id || "",
          number: v.number || "",
          route: v.route || "",
          pickupPoint: user.pickupPoint || user.location || "",
        }))
        .filter((v) => v.number && v.number !== "Not Assigned" && v.number !== "");
    }

    // Deduplicate by id or number
    const seen = new Set();
    assignedVehicles = assignedVehicles.filter((v) => {
      const key = v.id || v.number;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const primaryVehicle = assignedVehicles[0] || null;
    const vehicleNumber =
      assignedVehicles.length > 0
        ? assignedVehicles.map((v) => v.number).join(", ")
        : (user.vehicle && user.vehicle !== "Not Assigned" ? user.vehicle : (user.vehicleNumber || "Not Assigned"));

    const vehicleId = primaryVehicle?.id || user.vehicleId || null;
    const vehicleIds = assignedVehicles.map((v) => v.id).filter(Boolean);
    const route =
      assignedVehicles.length > 0
        ? assignedVehicles.map((v) => v.route).filter(Boolean).join(", ") || "Not Assigned"
        : (user.route || "Not Assigned");

    const studentPickupPoint =
      primaryVehicle?.pickupPoint ||
      user.pickupPoint ||
      (user.studentAssignments && user.studentAssignments[0]?.pickupPoint) ||
      user.location ||
      "";

    return {
      id: user.id,
      name: user.name,
      dept: user.department || "N/A",
      email: user.email || "N/A",
      image,
      rawImage,
      bus: vehicleNumber || "Not Assigned",
      vehicleId: vehicleId,
      vehicleIds: vehicleIds,
      vehicleNumber: vehicleNumber || "Not Assigned",
      route: route || "Not Assigned",
      pickupPoint: studentPickupPoint,
      assignedVehicles: assignedVehicles,
      payment: user.paymentStatus || "Pending",
      isOnline: !!user.isOnline,
      lastSeenAt: user.lastSeenAt || null,
      details: {
        studentInfo: {
          rollNumber: user.rollNumber || user.id.substring(0, 8).toUpperCase(),
          studentPhone: user.phone || "N/A",
          parentName: user.parentName || "Not Linked",
          parentPhone: user.parentPhone || "N/A",
          currentYear: user.year || "N/A",
          residentialAddress: user.homeAddress || "N/A",
        },
        transportInfo: {
          assignedBus: vehicleNumber || "Not Assigned",
          route: route || "Not Assigned",
          pickupPoint: studentPickupPoint || "N/A",
        },
        paymentInfo: {
          lastPaymentDate: "N/A",
          totalAmountPaid: "N/A",
          amountPending: "N/A",
          nextTermDue: "N/A",
        },
        loginId: user.loginId || user.email || "N/A",
        password: extras.password || user.password || user.plainPassword || "",
        image: rawImage,
      },
    };
  };

  const loadStudents = async () => {
    try {
      const students = await fetchUsers("student");
      const mapped = students.map((s) => mapUserToRow(s));
      setData(mapped);
    } catch (error) {
      console.error("Error loading students:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    try {
      const buses = await fetchVehicles();
      setVehicles(buses);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    }
  };

  useEffect(() => {
    loadStudents();
    loadVehicles();

    const refresh = () => {
      loadStudents();
      loadVehicles();
    };

    socket.on("studentLocationUpdate", refresh);
    socket.on("studentTransitCompleted", refresh);
    socket.on("attendance_scanned", refresh);
    socket.on("userUpdated", refresh);
    socket.on("vehicleMembersUpdated", refresh);

    return () => {
      socket.off("studentLocationUpdate", refresh);
      socket.off("studentTransitCompleted", refresh);
      socket.off("attendance_scanned", refresh);
      socket.off("userUpdated", refresh);
      socket.off("vehicleMembersUpdated", refresh);
    };
  }, []);

  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const pickupLocation = formData.get("pickupPoint") || pickupPoint || "";

    if (editStudent) {
      try {
        const payload = {
          name: formData.get("name"),
          department: formData.get("dept"),
          year: formData.get("year"),
          paymentStatus: formData.get("payment"),
          phone: formData.get("phone"),
          rollNumber: formData.get("rollNumber"),
          homeAddress: formData.get("address"),
          location: pickupLocation || undefined,
          pickupPoint: pickupLocation || undefined,
          vehicleIds: selectedVehicleIds,
          image: imagePreview || undefined,
        };

        await updateUser(editStudent.id, payload);

        const [freshStudents] = await Promise.all([
          fetchUsers("student"),
          loadVehicles(),
        ]);

        socket.emit("vehicleMembersUpdated", {});

        const mapped = freshStudents.map((s) =>
          mapUserToRow(
            s,
            s.id === editStudent.id
              ? { password: formData.get("password") || editStudent.details.password }
              : {}
          )
        );
        setData(mapped);
        setSelectedStudent(mapped.find((s) => s.id === editStudent.id) || null);
      } catch (error) {
        console.error("Error updating student:", error);
        alert(error.message || "Unable to update student.");
        return;
      }
    } else {
      try {
        const payload = {
          name: formData.get("name"),
          email: formData.get("loginId"),
          password: formData.get("password"),
          role: "student",
          phone: formData.get("phone"),
          department: formData.get("dept"),
          year: formData.get("year"),
          paymentStatus: formData.get("payment"),
          rollNumber: formData.get("rollNumber"),
          homeAddress: formData.get("address"),
          location: pickupLocation || undefined,
          pickupPoint: pickupLocation || undefined,
          vehicleIds: selectedVehicleIds,
          image: imagePreview || undefined,
        };

        const createdStudent = await createUser(payload);

        const [freshStudents] = await Promise.all([
          fetchUsers("student"),
          loadVehicles(),
        ]);

        socket.emit("vehicleMembersUpdated", {});

        const mapped = freshStudents.map((s) =>
          mapUserToRow(
            s,
            s.id === createdStudent.id
              ? { password: formData.get("password") }
              : {}
          )
        );
        setData(mapped);
        setSelectedStudent(mapped.find((s) => s.id === createdStudent.id) || null);
      } catch (error) {
        console.error("Error saving student:", error);
        alert(error.message || "Unable to save student.");
        return;
      }
    }

    setShowAddModal(false);
    setEditStudent(null);
    setSelectedVehicleIds([]);
    setPickupPoint("");
  };

  const openAddModal = () => {
    setEditStudent(null);
    setSelectedVehicleIds([]);
    setPickupPoint("");
    setImagePreview("");
    setImageError("");
    setShowAddModal(true);
  };

  const openEditModal = (user) => {
    setEditStudent(user);
    const initialVehicleIds =
      user.assignedVehicles && user.assignedVehicles.length > 0
        ? user.assignedVehicles.map((v) => v.id).filter(Boolean)
        : user.vehicleIds && user.vehicleIds.length > 0
        ? user.vehicleIds
        : user.vehicleId
        ? [user.vehicleId]
        : [];
    setSelectedVehicleIds(initialVehicleIds);
    setPickupPoint(user.pickupPoint || "");
    const existingImage = user.rawImage || user.details?.image || "";
    setImagePreview(existingImage);
    setImageError("");
    setShowAddModal(true);
  };

  const confirmDeleteStudent = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setData((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      if (selectedStudent?.id === deleteTarget.id) setSelectedStudent(null);
    } catch (error) {
      console.error("Error deleting student:", error);
      alert(error.message || "Unable to delete student.");
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
          <div className="student-page-header">
            <h1>Student Management</h1>
            <button
              className="btn btn-primary student-btn-add"
              onClick={openAddModal}
            >
              <Plus size={18} /> Add Student
            </button>
          </div>

          {showAddModal && (
            <div className="student-modal-overlay">
              <div className="student-modal">
                <div className="student-modal-header">
                  {editStudent ? (
                    <Edit size={22} color="#9333EA" />
                  ) : (
                    <Plus size={22} color="#9333EA" />
                  )}
                  <h2>{editStudent ? "Edit Student" : "Add New Student"}</h2>
                </div>

                <form
                  id="student-form"
                  onSubmit={handleSave}
                  className="student-modal-body"
                >
                  {/* Designation Section */}
                  <div className="student-form-section">
                    <h3>System Role & Designation</h3>
                    <div className="student-field">
                      <label>Assigned Designation</label>
                      <input type="text" value="Student" disabled />
                    </div>
                  </div>

                  {/* Personal Information Section */}
                  <div className="student-form-section">
                    <h3>Personal Information</h3>

                    <div className="student-field">
                      <label>Student Name</label>
                      <input
                        name="name"
                        type="text"
                        placeholder="e.g. Aarav Sharma"
                        defaultValue={editStudent?.name || ""}
                        required
                      />
                    </div>

                    <div className="student-form-row">
                      <div className="student-field">
                        <label>University Registration ID</label>
                        <input
                          name="rollNumber"
                          type="text"
                          placeholder="e.g. 21CS1042"
                          defaultValue={
                            editStudent?.details?.studentInfo?.rollNumber || ""
                          }
                          required
                        />
                      </div>
                      <div className="student-field">
                        <label>Department</label>
                        <input
                          name="dept"
                          type="text"
                          placeholder="e.g. Computer Science"
                          defaultValue={editStudent?.dept || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="student-form-row">
                      <div className="student-field">
                        <label>Year</label>
                        <input
                          name="year"
                          type="text"
                          placeholder="e.g. 2nd Year"
                          defaultValue={
                            editStudent?.details?.studentInfo?.currentYear || ""
                          }
                          required
                        />
                      </div>
                      <div className="student-field">
                        <label>Payment Status</label>
                        <select
                          name="payment"
                          defaultValue={editStudent?.payment || "Pending"}
                          required
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                          <option value="Issue">Issue</option>
                        </select>
                      </div>
                    </div>

                    <div className="student-field">
                      <label>Residential Address</label>
                      <input
                        name="address"
                        type="text"
                        placeholder="Residential address"
                        defaultValue={
                          editStudent?.details?.studentInfo
                            ?.residentialAddress || ""
                        }
                        required
                      />
                    </div>

                    <div className="student-field">
                      <label>Phone</label>
                      <input
                        name="phone"
                        type="text"
                        placeholder="e.g. 98765 43210"
                        defaultValue={
                          editStudent?.details?.studentInfo?.studentPhone || ""
                        }
                        required
                      />
                    </div>

                    <div className="student-field">
                      <label>Profile Image (JPG / PNG)</label>
                      <input
                        name="imageFile"
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          setImageProcessing(true);
                          handleImageChange(
                            file,
                            (val) => {
                              setImagePreview(val);
                              setImageProcessing(false);
                            },
                            (err) => {
                              setImageError(err);
                              setImageProcessing(false);
                            }
                          );
                        }}
                      />
                      {imageError && (
                        <div style={{ color: "#DC2626", fontSize: 12, marginTop: 4 }}>
                          {imageError}
                        </div>
                      )}
                      {imagePreview && (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            objectFit: "cover",
                            marginTop: 8,
                            border: "1px solid #e2e8f0",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Transport Details Section */}
                  <div className="student-form-section transport">
                    <h3>
                      <BusFront size={18} color="#9333EA" /> Transport Details
                    </h3>

                    <div className="student-field">
                      <label>Assigned Bus / Vehicle(s)</label>
                      {selectedVehicleIds.length > 0 && (
                        <div className="student-selected-vehicles-list">
                          {selectedVehicleIds.map((vId) => {
                            const v = vehicles.find((item) => item.id === vId || item.number === vId);
                            const label = v
                              ? `${v.number}${v.route ? ` (Route: ${v.route})` : ""}`
                              : `Vehicle: ${vId.slice(0, 8)}…`;
                            return (
                              <span key={vId} className="student-vehicle-badge">
                                <span>{label}</span>
                                <button
                                  type="button"
                                  className="student-vehicle-badge-remove"
                                  onClick={() =>
                                    setSelectedVehicleIds((prev) =>
                                      prev.filter((id) => id !== vId)
                                    )
                                  }
                                  title="Remove vehicle assignment"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          if (!selectedVehicleIds.includes(val)) {
                            setSelectedVehicleIds((prev) => [...prev, val]);
                          }
                        }}
                      >
                        <option value="">
                          {selectedVehicleIds.length === 0
                            ? "Select Bus / Vehicle (or leave unassigned)"
                            : "+ Add another vehicle assignment…"}
                        </option>
                        {vehicles.map((v) => {
                          const isSelected = selectedVehicleIds.includes(v.id);
                          const isMaintenance =
                            v.status && v.status.toLowerCase() === "maintenance";
                          const isInactive =
                            v.status && v.status.toLowerCase() === "inactive";
                          const studentCount =
                            v.assignedStudents?.length || v.studentIds?.length || 0;
                          const capacityText = v.capacity
                            ? ` • ${studentCount}/${v.capacity} Seats`
                            : "";
                          const statusText = isMaintenance
                            ? " [Maintenance]"
                            : isInactive
                            ? " [Inactive]"
                            : "";
                          const routeText = v.route
                            ? ` • Route: ${v.route}`
                            : " • No Route";

                          return (
                            <option key={v.id} value={v.id} disabled={isSelected}>
                              {isSelected ? "✓ Assigned: " : ""}{v.number || v.name || "Unknown"} (
                              {v.model || v.type || "Bus"}
                              {capacityText}
                              {statusText}
                              {routeText})
                            </option>
                          );
                        })}
                      </select>
                      {selectedVehicleIds.length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="student-clear-vehicles-btn"
                            onClick={() => setSelectedVehicleIds([])}
                          >
                            Clear all vehicle assignments
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="student-form-row">
                      <div className="student-field">
                        <label>Assigned Route(s)</label>
                        <input
                          type="text"
                          name="route"
                          value={
                            selectedVehicleIds.length > 0
                              ? vehicles
                                  .filter((v) => selectedVehicleIds.includes(v.id))
                                  .map((v) => v.route || "No Route")
                                  .filter(Boolean)
                                  .join(", ") || "No Route Assigned"
                              : "Not Assigned"
                          }
                          readOnly
                          className="student-field-readonly"
                          placeholder="Auto-assigned from vehicle(s)"
                        />
                      </div>
                      <div className="student-field">
                        <label>Pickup Point (Optional)</label>
                        <input
                          name="pickupPoint"
                          type="text"
                          placeholder="e.g. Guindy Bus Stand / Main Gate"
                          value={pickupPoint}
                          onChange={(e) => setPickupPoint(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Login Credentials Section */}
                  <div className="student-form-section credentials">
                    <h3>App Login Credentials</h3>
                    <div className="student-form-row">
                      <div className="student-field">
                        <label>App Login ID</label>
                        <input
                          name="loginId"
                          type="text"
                          placeholder="student@school.edu"
                          defaultValue={editStudent?.details?.loginId || ""}
                          required
                        />
                      </div>
                      <div className="student-field">
                        <label>Password</label>
                        <div className="student-password-input-wrapper">
                          <input
                            name="password"
                            type={showStudentModalPassword ? "text" : "password"}
                            placeholder="Set a login password"
                            defaultValue={editStudent?.details?.password || ""}
                            required={!editStudent}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowStudentModalPassword(!showStudentModalPassword)
                            }
                            className="student-password-input-eye"
                            title={
                              showStudentModalPassword
                                ? "Hide Password"
                                : "Show Password"
                            }
                          >
                            {showStudentModalPassword ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="student-modal-footer">
                  <button
                    type="button"
                    className="student-btn-cancel"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditStudent(null);
                      setSelectedVehicleIds([]);
                      setPickupPoint("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="student-form"
                    className="btn btn-primary student-btn-save"
                    disabled={imageProcessing}
                  >
                    {imageProcessing ? "Processing image…" : "Save Student"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="student-table-card">
            <div className="student-table-scroll">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Assigned Bus & Route</th>
                    <th>Payment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr className="student-empty-row">
                      <td colSpan={5}>
                        {loading ? "Loading students..." : "No students found yet."}
                      </td>
                    </tr>
                  ) : (
                    data.map((user) => {
                      const pStyles = getPaymentStyles(user.payment);
                      return (
                        <tr
                          key={user.id}
                          className={
                            selectedStudent?.id === user.id ? "selected" : ""
                          }
                          onClick={() => setSelectedStudent(user)}
                        >
                          <td>
                            <div className="student-name-cell">
                              <GraduationCap size={18} color="#9333EA" />
                              {user.name}
                            </div>
                          </td>
                          <td>{user.dept}</td>
                          <td className="student-bus-cell">
                            {user.assignedVehicles && user.assignedVehicles.length > 0 ? (
                              <div className="student-bus-list">
                                {user.assignedVehicles.map((veh, idx) => (
                                  <div key={veh.id || idx} className="student-bus-item">
                                    <div className="student-bus-number">{veh.number}</div>
                                    {veh.route && veh.route !== "Not Assigned" && (
                                      <div className="student-bus-route">
                                        Route: {veh.route}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="student-bus-unassigned">Not Assigned</div>
                            )}
                          </td>
                          <td>
                            <span
                              className="student-payment-badge"
                              style={{
                                backgroundColor: pStyles.bg,
                                color: pStyles.text,
                              }}
                            >
                              {user.payment}
                            </span>
                          </td>
                          <td
                            className="student-actions-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="student-action-btn student-action-edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(user);
                              }}
                            >
                              <Edit size={16} /> Edit
                            </button>
                            <button
                              className="student-action-btn student-action-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(user);
                              }}
                            >
                              <Trash2 size={16} /> Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedStudent && (
            <div className="student-detail-card">
              <button
                className="student-detail-close"
                onClick={() => setSelectedStudent(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>

              <h3 className="student-detail-title">
                <Info size={22} color="#9333EA" /> Student Complete Record:{" "}
                {selectedStudent.name}
              </h3>

              <div className="student-detail-body">
                {selectedStudent.image && (
                  <img
                    src={selectedStudent.image}
                    alt="Professional Avatar"
                    className="student-detail-avatar"
                  />
                )}
                <div className="student-detail-grid">
                  {/* Student Information Section */}
                  <div className="student-detail-section-label info">
                    Student Information
                  </div>
                  <strong>Email Id:</strong>
                  <span>{selectedStudent.email}</span>
                  <strong>Assigned Dept:</strong>
                  <span>{selectedStudent.dept}</span>
                  {Object.entries(selectedStudent.details.studentInfo).map(
                    ([key, value]) => (
                      <React.Fragment key={key}>
                        <strong>{formatKey(key)}:</strong>
                        <span>{value}</span>
                      </React.Fragment>
                    )
                  )}

                  {/* Transport Details Section */}
                  <div className="student-detail-section-label transport">
                    Transport Details
                  </div>
                  <strong>Bus / Vehicle:</strong>
                  <span>
                    {selectedStudent.assignedVehicles && selectedStudent.assignedVehicles.length > 0 ? (
                      <div className="student-detail-bus-list">
                        {selectedStudent.assignedVehicles.map((veh, idx) => (
                          <div key={veh.id || idx} className="student-detail-bus-item">
                            <span className="student-detail-bus-number">{veh.number}</span>
                            {veh.route && veh.route !== "Not Assigned" && (
                              <span className="student-detail-bus-route"> • Route: {veh.route}</span>
                            )}
                            {veh.pickupPoint && (
                              <span className="student-detail-bus-stop"> (📍 Stop: {veh.pickupPoint})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      selectedStudent.bus || selectedStudent.vehicleNumber || "Not Assigned"
                    )}
                  </span>
                  <strong>Route:</strong>
                  <span>{selectedStudent.route || "Not Assigned"}</span>
                  <strong>Pickup Point:</strong>
                  <span>{selectedStudent.pickupPoint || "Not Specified"}</span>

                  {/* Payment Details Section */}
                  <div className="student-detail-section-label payment">
                    Payment & Fee Details
                  </div>
                  <strong>Overall Status:</strong>
                  <span
                    className="student-detail-status"
                    style={{
                      color: getPaymentStyles(selectedStudent.payment).text,
                    }}
                  >
                    {selectedStudent.payment}
                  </span>
                  {Object.entries(selectedStudent.details.paymentInfo).map(
                    ([key, value]) => (
                      <React.Fragment key={key}>
                        <strong>{formatKey(key)}:</strong>
                        <span>{value}</span>
                      </React.Fragment>
                    )
                  )}

                  {/* App Login Setup */}
                  <div className="student-detail-section-label login">
                    App Login Credentials
                  </div>
                  <strong>Login ID:</strong>
                  <span>
                    {selectedStudent.details.loginId || "Not Assigned"}
                  </span>
                  <strong>Password:</strong>
                  <span className="student-detail-password-wrapper">
                    {selectedStudent.details.password ? (
                      <>
                        <span className="student-detail-password-text">
                          {showDetailPassword
                            ? selectedStudent.details.password
                            : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="student-password-toggle-btn"
                          title={
                            showDetailPassword ? "Hide Password" : "Show Password"
                          }
                        >
                          {showDetailPassword ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="student-detail-empty">Not Assigned</span>
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
        onConfirm={confirmDeleteStudent}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Students;
