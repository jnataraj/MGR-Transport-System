const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");

// GET /api/bus-change  (optional ?vehicleId=&routeId=)
exports.getBusChanges = async (req, res) => {
    try {
        const { vehicleId, routeId } = req.query;
        const where = {};
        if (vehicleId) {
            where.OR = [{ oldVehicleId: vehicleId }, { newVehicleId: vehicleId }];
        }
        if (routeId) where.routeId = routeId;

        const changes = await prisma.vehicleChangeLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
        });
        res.json(changes);
    } catch (err) {
        console.error("getBusChanges error:", err);
        res.status(500).json({ error: "Failed to fetch bus change history" });
    }
};

const getAssignedUserIds = async (vehicleId) => {
    if (!vehicleId) return [];

    const vehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        include: {
            driver: true,
            assignedStudents: { include: { student: true } },
            assignedCoordinators: { include: { coordinator: true } },
        },
    });

    if (!vehicle) return [];

    const ids = [
        vehicle.driverId,
        ...(vehicle.assignedStudents?.map((a) => a.studentId) || []),
        ...(vehicle.assignedCoordinators?.map((a) => a.coordinatorId) || []),
    ].filter(Boolean);

    const parentLinks = await prisma.user.findMany({
        where: { role: "parent", parentId: { in: vehicle.assignedStudents?.map((a) => a.studentId) || [] } },
        select: { id: true },
    }).catch(() => []);

    return [...new Set([...ids, ...parentLinks.map((p) => p.id)])];
};

// POST /api/bus-change
exports.createBusChange = async (req, res) => {
    try {
        const {
            routeId,
            routeName,
            oldVehicleId,
            oldVehicleNumber,
            newVehicleId,
            newVehicleNumber,
            reason,
            changedBy,
        } = req.body;

        if (!newVehicleId || !newVehicleNumber || !oldVehicleNumber) {
            return res.status(400).json({
                error: "oldVehicleNumber, newVehicleId and newVehicleNumber are required",
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const log = await tx.vehicleChangeLog.create({
                data: {
                    routeId: routeId || null,
                    routeName: routeName || null,
                    oldVehicleId: oldVehicleId || null,
                    oldVehicleNumber,
                    newVehicleId,
                    newVehicleNumber,
                    reason: reason || null,
                    changedBy: changedBy || "admin",
                },
            });

            // Sync the route assignment row (only if one exists — it may not,
            // e.g. if the "current vehicle" was picked directly and has no
            // matching RouteVehicleAssignment).
            if (routeId) {
                await tx.routeVehicleAssignment
                    .update({
                        where: { id: routeId },
                        data: { vehicleId: newVehicleId, vehicleNumber: newVehicleNumber },
                    })
                    .catch((e) => console.error("Error syncing route on bus change:", e));
            }

            // Move the driver from the old vehicle to the new one, so the
            // driver keeps driving their route and the vehicle's
            // Active/Offline status correctly follows them onto the new bus.
            if (oldVehicleId) {
                const oldVehicle = await tx.vehicle.findUnique({
                    where: { id: oldVehicleId },
                    select: { driverId: true },
                });

                if (oldVehicle?.driverId) {
                    await tx.vehicle.update({
                        where: { id: oldVehicleId },
                        data: { driverId: null },
                    });
                    await tx.vehicle.update({
                        where: { id: newVehicleId },
                        data: { driverId: oldVehicle.driverId },
                    });
                }
            }

            return log;
        });

        const io = req.app.get("io");
        const oldUserIds = await getAssignedUserIds(oldVehicleId);
        const newUserIds = await getAssignedUserIds(newVehicleId);
        const targetUserIds = [...new Set([...oldUserIds, ...newUserIds])];

        if (targetUserIds.length === 0) {
            console.warn("No assigned users found for bus change — no notifications sent.");
        }

        await Promise.all(
            targetUserIds.map((userId) =>
                triggerNotification(io, {
                    title: "🚌 Bus Change",
                    message: `${routeName || "Your route"} bus has changed from ${oldVehicleNumber} to ${newVehicleNumber}.`,
                    type: "vehicle_change",
                    sender: changedBy || "Admin",
                    target: null,
                    userId,
                    data: { routeId, oldVehicleNumber, newVehicleNumber },
                }).catch((e) => console.error(`Failed to notify user ${userId}:`, e))
            )
        );

        // Tell every connected admin dashboard to refresh vehicle data,
        // so Vehicle Management's status column updates live.
        if (io) {
            io.emit("vehicleUpdated", {
                reason: "bus_change",
                oldVehicleId,
                newVehicleId,
                routeId,
            });
        }

        res.status(201).json(result);
    } catch (err) {
        console.error("createBusChange error:", err);
        res.status(500).json({ error: "Failed to record bus change" });
    }
};