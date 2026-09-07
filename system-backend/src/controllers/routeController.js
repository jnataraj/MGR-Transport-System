const { PrismaClient } = require("../../generated/prisma");
const auditLogService = require("../services/auditLogService");

const prisma = new PrismaClient();


// GET /api/routes
// Optional query params: routeId, vehicleId, isActive
exports.getRoutes = async (req, res) => {
  try {
    const { routeId, vehicleId, isActive } = req.query;
    const where = {};
    if (routeId) where.routeId = routeId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (isActive !== undefined) where.isActive = isActive === "true";

    const routes = await prisma.routeVehicleAssignment.findMany({
      where,
      orderBy: { assignedAt: "desc" },
    });
    res.json(routes);
  } catch (error) {
    console.error("getRoutes error:", error);
    res.status(500).json({ error: "Failed to fetch routes" });
  }
};

// POST /api/routes
// A vehicle can only be actively on ONE route at a time. Before creating
// a new active assignment for a vehicle, any other active assignment for
// that same vehicle is deactivated — this is what prevents the
// "same vehicle shows up under two routes" bug.
exports.createRoute = async (req, res) => {
  try {
    const {
      routeId,
      routeName,
      vehicleId,
      vehicleNumber,
      isActive,
      assignedBy,
      notes,
    } = req.body;

    if (!routeId || !routeName) {
      return res.status(400).json({
        error: "routeId and routeName are required",
      });
    }

    const route = await prisma.$transaction(async (tx) => {
      if (vehicleId && isActive !== false) {
        await tx.routeVehicleAssignment.updateMany({
          where: { vehicleId, isActive: true },
          data: {
            isActive: false,
            removedAt: new Date(),
            removedBy: assignedBy || "admin",
          },
        });
      }

      const newRoute = await tx.routeVehicleAssignment.create({
        data: {
          routeId,
          routeName,
          vehicleId: vehicleId || null,
          vehicleNumber: vehicleNumber || null,
          isActive: isActive ?? true,
          assignedBy: assignedBy || "admin",
          notes: notes || null,
        },
      });

      await auditLogService.record({
        req,
        action: "ROUTE_CREATED",
        eventType: "CREATE",
        module: "ROUTE_MANAGEMENT",
        entityType: "ROUTE",
        entityId: newRoute.id,
        description: `Created route "${routeName}" (ID: ${routeId}) assigned to vehicle ${vehicleNumber || "None"}`,
        newValues: {
          routeId,
          routeName,
          vehicleId,
          vehicleNumber,
          isActive: isActive ?? true,
        },
        tx,
      });

      return newRoute;
    });

    if (vehicleId && isActive !== false) {
      await prisma.vehicle
        .update({
          where: { id: vehicleId },
          data: { route: routeName },
        })
        .catch((e) =>
          console.error("Error syncing vehicle route on create:", e),
        );
    }

    res.status(201).json(route);
  } catch (error) {
    console.error("createRoute error:", error);
    // Unique constraint on [routeId, vehicleId]
    if (error.code === "P2002") {
      return res
        .status(409)
        .json({ error: "This vehicle is already assigned to this route" });
    }
    res.status(500).json({ error: "Failed to create route" });
  }
};

// PUT /api/routes/:id
// Same single-active-route guard applies here for the case where an
// existing row gets reassigned to a different vehicle.
exports.updateRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const { routeId, routeName, vehicleId, vehicleNumber, isActive, notes } =
      req.body;

    const previousRoute = await prisma.routeVehicleAssignment.findUnique({
      where: { id },
    });

    if (!previousRoute) {
      return res.status(404).json({ error: "Route not found" });
    }

    const route = await prisma.$transaction(async (tx) => {
      if (vehicleId && isActive !== false) {
        await tx.routeVehicleAssignment.updateMany({
          where: { vehicleId, isActive: true, NOT: { id } },
          data: {
            isActive: false,
            removedAt: new Date(),
            removedBy: "admin",
          },
        });
      }

      const updated = await tx.routeVehicleAssignment.update({
        where: { id },
        data: {
          ...(routeId !== undefined && { routeId }),
          ...(routeName !== undefined && { routeName }),
          ...(vehicleId !== undefined && { vehicleId }),
          ...(vehicleNumber !== undefined && { vehicleNumber }),
          ...(isActive !== undefined && { isActive }),
          ...(notes !== undefined && { notes }),
        },
      });

      await auditLogService.record({
        req,
        action: "ROUTE_UPDATED",
        eventType: "UPDATE",
        module: "ROUTE_MANAGEMENT",
        entityType: "ROUTE",
        entityId: id,
        description: `Updated route "${updated.routeName}" (ID: ${updated.routeId})`,
        oldValues: {
          routeName: previousRoute.routeName,
          routeId: previousRoute.routeId,
          vehicleNumber: previousRoute.vehicleNumber,
          isActive: previousRoute.isActive,
        },
        newValues: {
          routeName: updated.routeName,
          routeId: updated.routeId,
          vehicleNumber: updated.vehicleNumber,
          isActive: updated.isActive,
        },
        tx,
      });

      return updated;
    });

    if (route.vehicleId && route.isActive && route.routeName) {
      await prisma.vehicle
        .update({
          where: { id: route.vehicleId },
          data: { route: route.routeName },
        })
        .catch((e) =>
          console.error("Error syncing vehicle route on update:", e),
        );
    }

    res.json(route);
  } catch (error) {
    console.error("updateRoute error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Route not found" });
    }
    res.status(500).json({ error: "Failed to update route" });
  }
};

// PATCH /api/routes/:id/deactivate
// Soft delete: flips isActive false and stamps removedAt/removedBy,
// instead of destroying the row.
exports.deactivateRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const { removedBy } = req.body;

    const route = await prisma.routeVehicleAssignment.update({
      where: { id },
      data: {
        isActive: false,
        removedAt: new Date(),
        removedBy: removedBy || "admin",
      },
    });

    await auditLogService.record({
      req,
      action: "ROUTE_DEACTIVATED",
      eventType: "STATUS_CHANGE",
      module: "ROUTE_MANAGEMENT",
      entityType: "ROUTE",
      entityId: id,
      description: `Deactivated route "${route.routeName}" (Vehicle: ${route.vehicleNumber || "None"})`,
      oldValues: { isActive: true },
      newValues: { isActive: false, removedBy: removedBy || "admin" },
    });

    res.json(route);
  } catch (error) {
    console.error("deactivateRoute error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Route not found" });
    }
    res.status(500).json({ error: "Failed to deactivate route" });
  }
};

// DELETE /api/routes/:id
// Hard delete: permanently removes the RouteVehicleAssignment row.
// If the deleted record was active, also clears the route field on
// the linked vehicle so the Vehicle table stays consistent.
exports.deleteRoute = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch before deleting so we can sync the vehicle afterwards.
    const existing = await prisma.routeVehicleAssignment.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Route not found" });
    }

    await prisma.routeVehicleAssignment.delete({ where: { id } });

    // If this assignment was active, clear the route field on the vehicle.
    if (existing.isActive && existing.vehicleId) {
      await prisma.vehicle
        .update({
          where: { id: existing.vehicleId },
          data: { route: null },
        })
        .catch((e) =>
          console.error("Error clearing vehicle route on delete:", e),
        );
    }

    await auditLogService.record({
      req,
      action: "ROUTE_DELETED",
      eventType: "DELETE",
      module: "ROUTE_MANAGEMENT",
      entityType: "ROUTE",
      entityId: id,
      description: `Permanently deleted route "${existing.routeName}" (ID: ${existing.routeId})`,
      oldValues: {
        routeId: existing.routeId,
        routeName: existing.routeName,
        vehicleNumber: existing.vehicleNumber,
      },
    });

    res.json({ success: true, message: "Route permanently deleted" });
  } catch (error) {
    console.error("deleteRoute error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Route not found" });
    }
    res.status(500).json({ error: "Failed to delete route" });
  }
};