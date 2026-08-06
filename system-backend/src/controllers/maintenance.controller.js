const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");

// Resolve a vehicle by its number (dropdown sends the number, e.g. "TN-01-AA-1234")
const resolveVehicle = async (vehicleNumberOrId) => {
    if (!vehicleNumberOrId) return null;
    return prisma.vehicle.findFirst({
        where: {
            OR: [{ id: vehicleNumberOrId }, { number: vehicleNumberOrId }],
        },
        include: {
            driver: true,
            assignedStudents: { include: { student: true } },
            assignedCoordinators: { include: { coordinator: true } },
        },
    });
};

// GET /api/maintenance/overview
// Powers the Maintenance & Issues page: driver-raised issues, admin logs, completed log
exports.getMaintenanceOverview = async (req, res) => {
    try {
        const [openIssues, activeAlerts, resolvedIssues, resolvedAlerts] =
            await Promise.all([
                prisma.issue.findMany({
                    where: { status: "open" },
                    orderBy: { createdAt: "desc" },
                }),
                prisma.maintenanceAlert.findMany({
                    where: { status: { in: ["Pending", "Acknowledged"] } },
                    orderBy: { createdAt: "desc" },
                }),
                prisma.issue.findMany({
                    where: { status: "resolved" },
                    orderBy: { createdAt: "desc" },
                    take: 25,
                }),
                prisma.maintenanceAlert.findMany({
                    where: { status: "Resolved" },
                    orderBy: { resolvedAt: "desc" },
                    take: 25,
                }),
            ]);

        // Normalize both sources into one "Completed Maintenance Log" shape
        const completedFromIssues = resolvedIssues.map((i) => ({
            id: i.id,
            issueType: i.type,
            vehicle: i.vehicleId || "-",
            raisedBy: i.reportedBy,
            priority: "Medium",
            resolvedBy: "Workshop",
            resolvedAt: i.createdAt,
            status: "Resolved",
        }));

        const completedFromAlerts = resolvedAlerts.map((a) => ({
            id: a.id,
            issueType: a.issueType,
            vehicle: a.vehicle,
            raisedBy: a.raisedBy,
            priority: a.priority,
            resolvedBy: a.acknowledgedBy || "Maintenance Team",
            resolvedAt: a.resolvedAt || a.updatedAt,
            status: "Resolved",
        }));

        const completedLog = [...completedFromIssues, ...completedFromAlerts].sort(
            (a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt),
        );

        const criticalCount = activeAlerts.filter(
            (a) => a.priority === "Critical",
        ).length;

        res.json({
            driverIssues: openIssues,
            adminLogs: activeAlerts,
            completedLog,
            summary: {
                openCount: openIssues.length + activeAlerts.length,
                criticalCount,
            },
        });
    } catch (err) {
        console.error("getMaintenanceOverview error:", err);
        res.status(500).json({ error: "Failed to fetch maintenance overview" });
    }
};

// POST /api/maintenance/logs
// Creates a MaintenanceAlert and notifies the selected member groups for that vehicle
exports.createMaintenanceLog = async (req, res) => {
    try {
        const {
            vehicle: vehicleInput,
            issueType,
            priority = "Medium",
            description,
            raisedBy = "Admin",
            notify = {},
        } = req.body;

        if (!vehicleInput || !issueType || !description) {
            return res.status(400).json({
                error: "vehicle, issueType and description are required",
            });
        }

        const vehicleRecord = await resolveVehicle(vehicleInput);
        const vehicleNumber = vehicleRecord?.number || vehicleInput;

        const log = await prisma.maintenanceAlert.create({
            data: {
                vehicle: vehicleNumber,
                issueType,
                description,
                priority,
                raisedBy,
                status: "Pending",
            },
        });

        const io = req.app.get("io");
        const notifyResults = { notified: 0, targets: [] };

        const sendTo = async (userId, title, message, target) => {
            if (!userId) return;
            await triggerNotification(io, {
                title,
                message,
                type: "maintenance",
                sender: raisedBy,
                target: target || userId,
                userId,
                data: { maintenanceId: log.id, vehicle: vehicleNumber, priority },
            });
            notifyResults.notified += 1;
        };

        const title = `Maintenance Alert`;
        const baseMessage = `${vehicleNumber} — ${issueType}`;

        if (vehicleRecord) {
            if (notify.driver && vehicleRecord.driver) {
                await sendTo(vehicleRecord.driver.id, title, baseMessage);
                notifyResults.targets.push("driver");
            }

            if (notify.students && vehicleRecord.assignedStudents?.length) {
                await Promise.all(
                    vehicleRecord.assignedStudents.map((a) =>
                        sendTo(a.student?.id, title, baseMessage),
                    ),
                );
                notifyResults.targets.push("students");
            }

            if (notify.parents && vehicleRecord.assignedStudents?.length) {
                const parentIds = vehicleRecord.assignedStudents
                    .map((a) => a.student?.parentId)
                    .filter(Boolean);
                await Promise.all(
                    parentIds.map((pid) => sendTo(pid, title, baseMessage)),
                );
                notifyResults.targets.push("parents");
            }

            if (notify.coordinator && vehicleRecord.assignedCoordinators?.length) {
                await Promise.all(
                    vehicleRecord.assignedCoordinators.map((a) =>
                        sendTo(a.coordinator?.id, title, baseMessage),
                    ),
                );
                notifyResults.targets.push("coordinator");
            }
        }

        // No direct Vehicle <-> HoD link in schema yet, so broadcast by role
        if (notify.hod) {
            await triggerNotification(io, {
                title,
                message: baseMessage,
                type: "maintenance",
                sender: raisedBy,
                target: "hod",
                data: { maintenanceId: log.id, vehicle: vehicleNumber, priority },
            });
            notifyResults.targets.push("hod");
        }

        res.status(201).json({ log, notifyResults });
    } catch (err) {
        console.error("createMaintenanceLog error:", err);
        res.status(500).json({ error: "Failed to create maintenance log" });
    }
};

// PATCH /api/maintenance/logs/:id/resolve
exports.resolveMaintenanceLog = async (req, res) => {
    try {
        const { id } = req.params;
        const { acknowledgedBy } = req.body;

        const log = await prisma.maintenanceAlert.update({
            where: { id },
            data: {
                status: "Resolved",
                resolvedAt: new Date(),
                acknowledgedBy: acknowledgedBy || "Maintenance Team",
            },
        });

        res.json(log);
    } catch (err) {
        console.error("resolveMaintenanceLog error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Log not found" });
        }
        res.status(500).json({ error: "Failed to resolve maintenance log" });
    }
};