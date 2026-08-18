import { useState, useEffect } from "react";
import { Users, Plus, Edit, Trash2, Info, X, GraduationCap, Eye, EyeOff } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchUsers, createUser, updateUser, deleteUser } from "../../api";
import "./Parents.css";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";
import { handleImageChange } from "../../components/imageResize";

const mapUserToVM = (u, studentMatch) => {
  const studentPhoto =
    studentMatch?.image && studentMatch.image.trim() !== ""
      ? studentMatch.image
      : null;
  const parentPhoto =
    u.image && u.image.trim() !== "" ? u.image : null;

  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    student: u.studentName || studentMatch?.name || "N/A",
    image: parentPhoto,
    details: {
      email: u.email,
      occupation: u.occupation || "",
      homeAddress: u.homeAddress || "",
      loginId: u.loginId || u.email || "",
      password: u.password || u.plainPassword || "",
      studentData: {
        name: u.studentName || studentMatch?.name || "N/A",
        rollNo: u.studentRollNo || studentMatch?.rollNumber || "",
        dept: studentMatch?.department || u.department || "To Be Assigned",
        bus: studentMatch?.vehicle || u.assignedVehicle?.number || "To Be Assigned",
        payment: studentMatch?.paymentStatus || u.paymentStatus || "Pending",
        image: studentPhoto,
      },
    },
  };
};

const Parents = () => {
  const [data, setData] = useState([]);
  const [selectedParent, setSelectedParent] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editParent, setEditParent] = useState(null);
  const [students, setStudents] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageProcessing, setImageProcessing] = useState(false);
  const [showDetailPassword, setShowDetailPassword] = useState(true);
  const [showParentModalPassword, setShowParentModalPassword] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(
    editParent?.student || ""
  );
  const [studentRollNo, setStudentRollNo] = useState(
    editParent?.details?.studentData?.rollNo || ""
  );

  const getStudentMatch = (u, studentList = students) => {
    if (!u) return null;
    const rollNo = u.studentRollNo;
    const name = u.studentName;

    return (studentList || []).find((s) => {
      if (rollNo && s.rollNumber && s.rollNumber.trim().toLowerCase() === rollNo.trim().toLowerCase()) return true;
      if (s.parentId && s.parentId === u.id) return true;
      if (name && s.name && s.name.trim().toLowerCase() === name.trim().toLowerCase()) return true;
      if (rollNo && s.name && s.name.trim().toLowerCase() === rollNo.trim().toLowerCase()) return true;
      return false;
    });
  };

  const loadData = async () => {
    try {
      const studentRes = await fetchUsers("student");
      setStudents(studentRes);
      const parentRes = await fetchUsers("parent");
      setData(
        parentRes.map((u) => mapUserToVM(u, getStudentMatch(u, studentRes)))
      );
    } catch (err) {
      console.error("Failed to load parent data", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (editParent) {
      setSelectedStudent(editParent.student || "");
      setStudentRollNo(
        editParent.details?.studentData?.rollNo || ""
      );
    } else {
      setSelectedStudent("");
      setStudentRollNo("");
    }
  }, [editParent]);

  const confirmDeleteParent = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setData((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      if (selectedParent?.id === deleteTarget.id) setSelectedParent(null);
    } catch (err) {
      console.error("Delete failed", err);
      alert(err.message || "Unable to delete parent.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const selected = students.find(
      (s) => s.name === selectedStudent
    );

    const payload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      role: "parent",
      email: formData.get("email"),
      occupation: formData.get("occupation"),
      homeAddress: formData.get("address"),
      studentName: selected?.name || "",
      studentRollNo: selected?.rollNumber || "",
      loginId: formData.get("loginId"),
      image: imagePreview || undefined,
    };

    const passwordValue = formData.get("password");
    if (passwordValue) {
      payload.password = passwordValue;
    }
    (async () => {
      try {
        let savedId;

        if (editParent) {
          await updateUser(editParent.id, payload);
          savedId = editParent.id;
        } else {
          const created = await createUser(payload);
          savedId = created.id;
        }

        const [users, currentStudents] = await Promise.all([
          fetchUsers("parent"),
          fetchUsers("student"),
        ]);
        setStudents(currentStudents);
        const mapped = users.map((u) =>
          mapUserToVM(u, getStudentMatch(u, currentStudents))
        );
        setData(mapped);

        // ✅ keep the detail card in sync with the just-saved record
        const updatedParent = mapped.find((p) => p.id === savedId);
        if (updatedParent) setSelectedParent(updatedParent);

        setShowAddModal(false);
        setEditParent(null);
      } catch (err) {
        console.error(err);
      }
    })();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />

        <section className="page-content">
          <div className="parent-page-header">
            <h1>Parent / Guardian Management</h1>
            <button
              className="btn btn-primary parent-btn-add"
              // onClick={() => {
              //   setEditParent(null);
              //   setShowAddModal(true);
              // }}
              onClick={() => {
                setEditParent(null);
                setImagePreview("");
                setImageError("");
                setShowAddModal(true);
              }}
            >
              <Plus size={18} /> Add Parent
            </button>
          </div>

          {showAddModal && (
            <div className="parent-modal-overlay">
              <div className="parent-modal">
                <div className="parent-modal-header">
                  {editParent ? (
                    <Edit size={22} color="#D97706" />
                  ) : (
                    <Plus size={22} color="#D97706" />
                  )}
                  <h2>{editParent ? "Edit Parent" : "Add New Parent"}</h2>
                </div>

                <form
                  id="parent-form"
                  onSubmit={handleSave}
                  className="parent-modal-body"
                >
                  {/* Designation Section */}
                  <div className="parent-form-section">
                    <h3>System Role & Designation</h3>
                    <div className="parent-field">
                      <label>Assigned Designation</label>
                      <input type="text" value="Parent / Guardian" disabled />
                    </div>
                  </div>

                  {/* Personal Information Section */}
                  <div className="parent-form-section">
                    <h3>Personal Information</h3>

                    <div className="parent-field">
                      <label>Parent Name</label>
                      <input
                        name="name"
                        type="text"
                        placeholder="e.g. Rajesh Kumar"
                        defaultValue={editParent?.name || ""}
                        required
                      />
                    </div>

                    <div className="parent-form-row">
                      <div className="parent-field">
                        <label>Phone</label>
                        <input
                          name="phone"
                          type="text"
                          placeholder="e.g. 98765 43210"
                          defaultValue={editParent?.phone || ""}
                          required
                        />
                      </div>
                      <div className="parent-field">
                        <label>Email</label>
                        <input
                          name="email"
                          type="email"
                          placeholder="parent@email.com"
                          defaultValue={editParent?.details?.email || ""}
                          required
                        />
                      </div>
                    </div>

                    <div className="parent-form-row">
                      <div className="parent-field">
                        <label>Occupation</label>
                        <input
                          name="occupation"
                          type="text"
                          placeholder="e.g. Software Engineer"
                          defaultValue={
                            editParent?.details?.occupation?.split(
                              " (ID:",
                            )[0] || ""
                          }
                          required
                        />
                      </div>
                      <div className="parent-field">
                        <label>Work ID Number</label>
                        <input
                          name="workId"
                          type="text"
                          placeholder="Optional"
                          defaultValue={
                            editParent?.details?.occupation?.includes("(ID:")
                              ? editParent.details.occupation
                                .split("(ID: ")[1]
                                .replace(")", "")
                              : ""
                          }
                        />
                      </div>
                    </div>

                    <div className="parent-field">
                      <label>Address</label>
                      <input
                        name="address"
                        type="text"
                        placeholder="Home address"
                        defaultValue={editParent?.details?.homeAddress || ""}
                        required
                      />
                    </div>

                    <div className="parent-field">
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

                  {/* Student Information Section */}
                  <div className="parent-form-section">
                    <h3>Student Connection</h3>
                    <div className="parent-form-row">
                      <div className="parent-field">
                        <label>Student Name</label>
                        <select
                          name="student"
                          value={selectedStudent}
                          onChange={(e) => {
                            const student = students.find(
                              (s) => s.name === e.target.value
                            );

                            setSelectedStudent(e.target.value);
                            setStudentRollNo(student?.rollNumber || "");
                          }}
                          required
                        >
                          <option value="">Select Student</option>

                          {students.map((student) => (
                            <option key={student.id} value={student.name}>
                              {student.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="parent-field">
                        <label>Student Roll No.</label>

                        <input
                          name="studentRollNo"
                          type="text"
                          value={studentRollNo}
                          readOnly
                        />
                      </div>
                    </div>
                  </div>

                  {/* Login Credentials Section */}
                  <div className="parent-form-section credentials">
                    <h3>App Login Credentials</h3>
                    <div className="parent-form-row">
                      <div className="parent-field">
                        <label>App Login ID</label>
                        <input
                          name="loginId"
                          type="text"
                          placeholder="parent@school.edu"
                          defaultValue={editParent?.details?.loginId || ""}
                          required
                        />
                      </div>
                      <div className="parent-field">
                        <label>App Password</label>
                        <div className="parent-password-input-wrapper">
                          <input
                            name="password"
                            type={showParentModalPassword ? "text" : "password"}
                            placeholder={
                              editParent
                                ? "Leave blank to keep current password"
                                : "Set a login password"
                            }
                            defaultValue={editParent?.details?.password || ""}
                            required={!editParent}
                          />
                          <button
                            type="button"
                            onClick={() => setShowParentModalPassword(!showParentModalPassword)}
                            className="parent-password-input-eye"
                            title={showParentModalPassword ? "Hide Password" : "Show Password"}
                          >
                            {showParentModalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>

                <div className="parent-modal-footer">
                  <button
                    type="button"
                    className="parent-btn-cancel"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditParent(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="parent-form"
                    className="btn btn-primary parent-btn-save"
                    disabled={imageProcessing}
                  >
                    {imageProcessing ? "Processing image…" : "Save Parent"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="parent-table-card">
            <div className="parent-table-scroll">
              <table className="parent-table">
                <thead>
                  <tr>
                    <th>Parent Name</th>
                    <th>Phone Number</th>
                    <th>Associated Student</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 ? (
                    <tr className="parent-empty-row">
                      <td colSpan={4}>No parents found yet.</td>
                    </tr>
                  ) : (
                    data.map((user) => (
                      <tr
                        key={user.id}
                        className={
                          selectedParent?.id === user.id ? "selected" : ""
                        }
                        onClick={() => setSelectedParent(user)}
                      >
                        <td>
                          <div className="parent-name-cell">
                            <Users size={18} color="#D97706" />
                            {user.name}
                          </div>
                        </td>
                        <td className="parent-phone-cell">{user.phone}</td>
                        <td>{user.student}</td>
                        <td
                          className="parent-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="parent-action-btn parent-action-edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditParent(user);
                              setImagePreview(user.image?.startsWith("data:") ? user.image : "");
                              setImageError("");
                              setShowAddModal(true);
                            }}
                          >
                            <Edit size={16} /> Edit
                          </button>
                          <button
                            className="parent-action-btn parent-action-delete"
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

          {selectedParent && (
            <div className="parent-detail-card">
              <button
                className="parent-detail-close"
                onClick={() => setSelectedParent(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>

              <h3 className="parent-detail-title">
                <Info size={22} color="#D97706" /> Guardian Profile:{" "}
                {selectedParent.name}
              </h3>

              <div className="parent-detail-body">
                {selectedParent.image ? (
                  <img
                    src={selectedParent.image}
                    alt="Parent Avatar"
                    className="parent-detail-avatar"
                  />
                ) : (
                  <div className="parent-detail-avatar-placeholder">
                    <Users size={36} color="#D97706" />
                  </div>
                )}
                <div className="parent-detail-grid">
                  <div className="parent-detail-section-label">
                    Parent Information
                  </div>
                  <strong>Email Address:</strong>
                  <span>{selectedParent.details.email}</span>
                  <strong>Primary Contact:</strong>
                  <span>{selectedParent.phone}</span>
                  <strong>Occupation:</strong>
                  <span>{selectedParent.details.occupation}</span>
                  <strong>Home Address:</strong>
                  <span>{selectedParent.details.homeAddress}</span>

                  {/* App Login Setup */}
                  <div className="parent-detail-section-label login">
                    App Login Credentials
                  </div>
                  <strong>Login ID:</strong>
                  <span>
                    {selectedParent.details.loginId || "Not Assigned"}
                  </span>
                  <strong>Password:</strong>
                  <span className="parent-detail-password-wrapper">
                    {selectedParent.details.password ? (
                      <>
                        <span className="parent-detail-password-text">
                          {showDetailPassword ? selectedParent.details.password : "••••••••"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowDetailPassword((prev) => !prev)}
                          className="parent-password-toggle-btn"
                          title={showDetailPassword ? "Hide Password" : "Show Password"}
                        >
                          {showDetailPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </>
                    ) : (
                      <span className="parent-detail-empty">Not Assigned</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Sub-Card for Associated Student Details */}
              <div className="parent-student-subcard">
                {selectedParent.details.studentData.image ? (
                  <img
                    src={selectedParent.details.studentData.image}
                    alt="Student"
                    className="parent-student-avatar"
                  />
                ) : (
                  <div className="parent-student-avatar-placeholder">
                    <GraduationCap size={28} color="#D97706" />
                  </div>
                )}
                <div className="parent-student-grid">
                  <div className="parent-student-grid-title">
                    Associated Student File
                  </div>
                  <strong>Student Name:</strong>
                  <span>{selectedParent.details.studentData.name}</span>
                  <strong>Roll Number:</strong>
                  <span>{selectedParent.details.studentData.rollNo}</span>
                  <strong>Department:</strong>
                  <span>{selectedParent.details.studentData.dept}</span>
                  <strong>Current Status:</strong>
                  <span
                    className="parent-student-status"
                    style={{
                      color:
                        selectedParent.details.studentData.payment === "Paid"
                          ? "#059669"
                          : "#D97706",
                    }}
                  >
                    {selectedParent.details.studentData.payment}
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
        onConfirm={confirmDeleteParent}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default Parents;
