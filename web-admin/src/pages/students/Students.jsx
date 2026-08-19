import React, { useState, useEffect } from "react";
import { GraduationCap, Plus, Edit, Trash2, Info, X, Eye, EyeOff } from "lucide-react";
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

  const mapUserToRow = (user, extras = {}) => {
    const rawImage = user.image || null;
    const image = user.image || `https://i.pravatar.cc/150?u=${user.id}`;
    return {
      id: user.id,
      name: user.name,
      dept: user.department || "N/A",
      email: user.email || "N/A",
      image,
      rawImage,
      bus: user.vehicle || "Not Assigned",
      payment: user.paymentStatus || "Pending",
      details: {
        studentInfo: {
          rollNumber: user.rollNumber || user.id.substring(0, 8).toUpperCase(),
          studentPhone: user.phone || "N/A",
          parentName: user.parentName || "Not Linked",
          parentPhone: user.parentPhone || "N/A",
          currentYear: user.year || "N/A",
          residentialAddress: user.homeAddress || "N/A",
        },
        paymentInfo: {
          lastPaymentDate: "N/A",
          totalAmountPaid: "N/A",
          amountPending: "N/A",
          nextTermDue: "N/A",
        },
        loginId: user.loginId || user.email || "N/A",
        password: extras.password || user.password || user.plainPassword || "",
        // image,
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

  useEffect(() => {
    const fetchStudents = async () => {
      await loadStudents();
    };

    fetchStudents();
  }, []);

  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase());
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
    loadVehicles();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const busSelection = formData.get("bus");

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
          image: imagePreview || undefined,
        };

        await updateUser(editStudent.id, payload);
        await assignStudentBus(editStudent.id, busSelection);

        const [freshStudents] = await Promise.all([
          fetchUsers("student"),
          loadVehicles(),
        ]);

        socket.emit("vehicleMembersUpdated", {});

        const mapped = freshStudents.map((s) =>
          mapUserToRow(s, s.id === editStudent.id ? { password: formData.get("password") || editStudent.details.password } : {})
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
          image: imagePreview || undefined,
        };

        const createdStudent = await createUser(payload);
        await assignStudentBus(createdStudent.id, busSelection);

        const [freshStudents] = await Promise.all([
          fetchUsers("student"),
          loadVehicles(),
        ]);

        socket.emit("vehicleMembersUpdated", {});

        const mapped = freshStudents.map((s) =>
          mapUserToRow(s, s.id === createdStudent.id ? { password: formData.get("password") } : {})
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
  };

  const getAssignedBus = (studentId) => {
    const match = vehicles.find(
      (v) =>
        v.studentIds?.includes(studentId) ||
        v.assignedStudents?.some((s) => s.id === studentId),
    );
    return match?.number || "Not Assigned";
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

  const handleMarkPaid = async (student) => {
    try {
      await updateUser(student.id, { paymentStatus: "Paid" });

      setData((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, payment: "Paid" } : s))
      );

      setSelectedStudent((prev) =>
        prev?.id === student.id ? { ...prev, payment: "Paid" } : prev
      );
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert(error.message || "Unable to update payment status.");
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
              onClick={() => {
                setEditStudent(null);
                setImagePreview("");
                setImageError("");
                setShowAddModal(true);
              }}
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
                        <label>Assigned Bus</label>
                        <select
                          name="bus"
                          defaultValue={editStudent?.bus || ""}
                          required
                        >
                          <option value="" disabled>
                            Select a bus
                          </option>
                          <option value="Not Assigned">Not Assigned</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.number || v.name}>
                              {v.number || v.name} {v.route ? `- ${v.route}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
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
                    </div>

                    <div className="student-field">
                      <label>Address</label>
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

                    <div className="student-form-row">
                      <div className="student-field">
                        <label>Phone</label>
                        <input
                          name="phone"
                          type="text"
                          placeholder="e.g. 98765 43210"
                          defaultValue={
                            editStudent?.details?.studentInfo?.studentPhone ||
                            ""
                          }
                          required
                        />
                      </div>
                      <div className="student-field">
                        <label>Payment Status</label>
                        <select
                          name="payment"
                          // defaultValue={editStudent?.payment || "Paid"}
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
                            onClick={() => setShowStudentModalPassword(!showStudentModalPassword)}
                            className="student-password-input-eye"
                            title={showStudentModalPassword ? "Hide Password" : "Show Password"}
                          >
                            {showStudentModalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
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
                    <th>Assigned Bus</th>
                    <th>Payment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr className="student-empty-row">
                      <td colSpan={5}>No students found yet.</td>
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
                            {user.bus}
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
                                setEditStudent(user);
                                const existingImage = user.rawImage || user.details?.image || "";
                                setImagePreview(existingImage);
                                setImageError("");
                                setShowAddModal(true);
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
                  <strong>Bus Route / Van:</strong>
                  <span>{selectedStudent.bus}</span>
                  {Object.entries(selectedStudent.details.studentInfo).map(
                    ([key, value]) => (
                      <React.Fragment key={key}>
                        <strong>{formatKey(key)}:</strong>
                        <span>{value}</span>
                      </React.Fragment>
                    ),
                  )}

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
                    ),
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
                          {showDetailPassword ? selectedStudent.details.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="student-password-toggle-btn"
                          title={showDetailPassword ? "Hide Password" : "Show Password"}
                        >
                          {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
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
