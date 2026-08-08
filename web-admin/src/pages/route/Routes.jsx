import { useState, useEffect } from "react";
import { Milestone, Plus, Edit, Trash2, Info, X } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import ConfirmDialog from "../../components/ConfirmDialog/ConfirmDialog";

import {
  fetchRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  fetchVehicles,
} from "../../api";
import "./Routes.css";

const getStatusStyles = (isActive) => {
  if (isActive) return { bg: "#DBEAFE", text: "#1D4ED8" };
  return { bg: "#F3F4F6", text: "#6B7280" };
};

const RoutesPage = () => {
  const [data, setData] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editRoute, setEditRoute] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const mapAssignmentToRow = (assignment) => ({
    id: assignment.id,
    routeId: assignment.routeId,
    routeName: assignment.routeName,
    vehicleId: assignment.vehicleId,
    vehicleNumber: assignment.vehicleNumber || "Not Assigned",
    isActive: assignment.isActive,
    details: {
      routeInfo: {
        assignedAt: assignment.assignedAt
          ? new Date(assignment.assignedAt).toLocaleString()
          : "N/A",
        assignedBy: assignment.assignedBy || "admin",
        removedAt: assignment.removedAt
          ? new Date(assignment.removedAt).toLocaleString()
          : "N/A",
        removedBy: assignment.removedBy || "N/A",
      },
      notes: assignment.notes || "No additional notes.",
    },
  });

  const loadRoutes = async () => {
    try {
      const routeAssignments = await fetchRoutes();
      const mapped = routeAssignments.map((r) => mapAssignmentToRow(r));
      setData(mapped);
    } catch (error) {
      console.error("Error loading routes:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadVehicles = async () => {
    try {
      const vehicleList = await fetchVehicles();
      setVehicles(vehicleList);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadRoutes(), loadVehicles()]);
    };
    init();
  }, []);

  const handleVehicleChange = (e) => {
    const vehicleId = e.target.value;
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const numberField = document.getElementById("route-vehicleNumber");
    if (numberField) {
      numberField.value = vehicle?.number || "";
    }
  };

  const confirmDeleteRoute = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRoute(deleteTarget.id);
      setData((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (selectedRoute?.id === deleteTarget.id) setSelectedRoute(null);
    } catch (error) {
      console.error("Error deleting route:", error);
      alert(error.message || "Unable to delete route.");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const vehicleId = formData.get("vehicleId");
    const vehicle = vehicles.find((v) => v.id === vehicleId);

    if (editRoute && !vehicleId) {
      alert("Please assign a vehicle.");
      return;
    }

    if (editRoute) {
      try {
        const payload = {
          routeId: formData.get("routeId"),
          routeName: formData.get("routeName"),
          vehicleId,
          vehicleNumber: vehicle?.number || "",
          isActive: formData.get("isActive") === "true",
          notes: formData.get("notes"),
        };

        const updated = await updateRoute(editRoute.id, payload);
        const updatedRow = mapAssignmentToRow(updated);

        setData((prev) =>
          prev.map((r) => (r.id === editRoute.id ? updatedRow : r)),
        );
        setSelectedRoute(updatedRow);
      } catch (error) {
        console.error("Error updating route:", error);
        alert(error.message || "Unable to update route.");
        return;
      }
    } else {
      try {
        // const payload = {
        //   routeId: formData.get("routeId"),
        //   routeName: formData.get("routeName"),
        //   vehicleId,
        //   vehicleNumber: vehicle?.number || "",
        //   isActive: formData.get("isActive") === "true",
        //   notes: formData.get("notes"),
        // };
        const payload = {
          routeId: formData.get("routeId"),
          routeName: formData.get("routeName"),
          vehicleId: vehicleId || null,
          vehicleNumber: vehicle?.number || null,
          isActive: formData.get("isActive") === "true",
          notes: formData.get("notes"),
        };

        const createdRoute = await createRoute(payload);
        const newRoute = mapAssignmentToRow(createdRoute);

        setData((prev) => [...prev, newRoute]);
        setSelectedRoute(newRoute);
      } catch (error) {
        console.error("Error saving route:", error);
        alert(error.message || "Unable to save route.");
        return;
      }
    }

    setShowAddModal(false);
    setEditRoute(null);
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />

        <section className="page-content">
          <div className="route-page-header">
            <h1>Route Management</h1>
            <button
              className="btn btn-primary route-btn-add"
              onClick={() => {
                setEditRoute(null);
                setShowAddModal(true);
              }}
            >
              <Plus size={18} /> Add New Route
            </button>
          </div>

          {showAddModal && (
            <div className="route-modal-overlay">
              <div className="route-modal">
                <div className="route-modal-header">
                  {editRoute ? (
                    <Edit size={22} color="#2563EB" />
                  ) : (
                    <Plus size={22} color="#2563EB" />
                  )}
                  <h2>{editRoute ? "Edit Route" : "Add New Route"}</h2>
                </div>

                <form
                  id="route-form"
                  onSubmit={handleSave}
                  className="route-modal-body"
                >
                  {/* Route Identity Section */}
                  <div className="route-form-section">
                    <h3>Route Identity</h3>

                    <div className="route-form-row">
                      <div className="route-field">
                        <label>Route ID</label>
                        <input
                          name="routeId"
                          type="text"
                          placeholder="e.g. RT-07"
                          defaultValue={editRoute?.routeId || ""}
                          required
                        />
                      </div>
                      <div className="route-field">
                        <label>Route Name</label>
                        <input
                          name="routeName"
                          type="text"
                          placeholder="e.g. Theni Route"
                          defaultValue={editRoute?.routeName || ""}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vehicle Assignment Section */}
                  <div className="route-form-section">
                    <h3>Vehicle Assignment</h3>

                    <div className="route-form-row">
                      <div className="route-field">
                        <label>Assign Vehicle</label>
                        <select
                          name="vehicleId"
                          defaultValue={editRoute?.vehicleId || ""}
                          onChange={handleVehicleChange}
                        // required
                        >
                          <option value="" disabled>
                            Select a vehicle
                          </option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.number} {v.model ? `- ${v.model}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="route-field">
                        <label>Vehicle Number</label>
                        <input
                          id="route-vehicleNumber"
                          name="vehicleNumber"
                          type="text"
                          placeholder="Auto-filled on selection"
                          defaultValue={editRoute?.vehicleNumber || ""}
                          disabled
                        />
                      </div>
                    </div>

                    <div className="route-field">
                      <label>Status</label>
                      <select
                        name="isActive"
                        defaultValue={
                          editRoute ? String(editRoute.isActive) : "true"
                        }
                        required
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="route-form-section notes">
                    <h3>Additional Notes</h3>
                    <div className="route-field">
                      <label>Notes (optional)</label>
                      <textarea
                        name="notes"
                        rows={3}
                        placeholder="Any additional context about this route assignment"
                        defaultValue={editRoute?.details?.notes || ""}
                      />
                    </div>
                  </div>
                </form>

                <div className="route-modal-footer">
                  <button
                    type="button"
                    className="route-btn-cancel"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditRoute(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="route-form"
                    className="btn btn-primary route-btn-save"
                  >
                    Save Route
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="route-table-card">
            <div className="route-table-scroll">
              <table className="route-table">
                <thead>
                  <tr>
                    <th>Route ID</th>
                    <th>Route Name</th>
                    <th>Assigned Vehicle</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="route-empty-row">
                      <td colSpan={5}>Loading routes…</td>
                    </tr>
                  ) : data.length === 0 ? (
                    <tr className="route-empty-row">
                      <td colSpan={5}>No routes found yet.</td>
                    </tr>
                  ) : (
                    data.map((route) => {
                      const sStyles = getStatusStyles(route.isActive);
                      return (
                        <tr
                          key={route.id}
                          className={
                            selectedRoute?.id === route.id ? "selected" : ""
                          }
                          onClick={() => setSelectedRoute(route)}
                        >
                          <td>
                            <div className="route-name-cell">
                              <Milestone size={18} color="#2563EB" />
                              {route.routeId}
                            </div>
                          </td>
                          <td>{route.routeName}</td>
                          <td className="route-vehicle-cell">
                            {route.vehicleNumber}
                          </td>
                          <td>
                            <span
                              className="route-status-badge"
                              style={{
                                backgroundColor: sStyles.bg,
                                color: sStyles.text,
                              }}
                            >
                              {route.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td
                            className="route-actions-cell"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="route-action-btn route-action-edit"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditRoute(route);
                                setShowAddModal(true);
                              }}
                            >
                              <Edit size={16} /> Edit
                            </button>
                            <button
                              className="route-action-btn route-action-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(route);
                              }}
                            >
                              <Trash2 size={16} /> Remove
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

          {selectedRoute && (
            <div className="route-detail-card">
              <button
                className="route-detail-close"
                onClick={() => setSelectedRoute(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>

              <h3 className="route-detail-title">
                <Info size={22} color="#2563EB" /> Route Complete Record:{" "}
                {selectedRoute.routeId}
              </h3>

              <div className="route-detail-body">
                <div className="route-detail-grid">
                  <div className="route-detail-section-label info">
                    Route Information
                  </div>
                  <strong>Route Name:</strong>
                  <span>{selectedRoute.routeName}</span>
                  <strong>Assigned Vehicle:</strong>
                  <span>{selectedRoute.vehicleNumber}</span>
                  <strong>Status:</strong>
                  <span
                    className="route-detail-status"
                    style={{
                      color: getStatusStyles(selectedRoute.isActive).text,
                    }}
                  >
                    {selectedRoute.isActive ? "Active" : "Inactive"}
                  </span>
                  <strong>Assigned At:</strong>
                  <span>{selectedRoute.details.routeInfo.assignedAt}</span>
                  <strong>Assigned By:</strong>
                  <span>{selectedRoute.details.routeInfo.assignedBy}</span>

                  {!selectedRoute.isActive && (
                    <>
                      <div className="route-detail-section-label removed">
                        Removal Details
                      </div>
                      <strong>Removed At:</strong>
                      <span>{selectedRoute.details.routeInfo.removedAt}</span>
                      <strong>Removed By:</strong>
                      <span>{selectedRoute.details.routeInfo.removedBy}</span>
                    </>
                  )}

                  <div className="route-detail-section-label notes">Notes</div>
                  <strong>Additional Notes:</strong>
                  <span>{selectedRoute.details.notes}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete route "${deleteTarget?.routeId}"?`}
        message="This will permanently delete the route from the database. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteRoute}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default RoutesPage;
