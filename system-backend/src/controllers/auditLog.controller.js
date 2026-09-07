const prisma = require("../prisma/prisma");
const auditLogService = require("../services/auditLogService");

/**
 * Build Prisma where clause from query filters
 */
const buildWhereClause = (query) => {
  const {
    search,
    userId,
    userRole,
    appName,
    action,
    module: auditModule,
    entityType,
    entityId,
    status,
    dateFrom,
    dateTo,
  } = query;

  const where = {};

  if (userId) {
    where.userId = { contains: String(userId).trim(), mode: "insensitive" };
  }

  if (userRole) {
    where.userRole = { equals: String(userRole).trim().toUpperCase() };
  }

  if (appName) {
    where.appName = { equals: String(appName).trim().toUpperCase() };
  }

  if (action) {
    where.action = { equals: String(action).trim().toUpperCase() };
  }

  if (auditModule) {
    where.module = { equals: String(auditModule).trim().toUpperCase() };
  }

  if (entityType) {
    where.entityType = { equals: String(entityType).trim().toUpperCase() };
  }

  if (entityId) {
    where.entityId = { contains: String(entityId).trim(), mode: "insensitive" };
  }

  if (status) {
    where.status = { equals: String(status).trim().toUpperCase() };
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!isNaN(from.getTime())) {
        from.setUTCHours(0, 0, 0, 0);
        where.createdAt.gte = from;
      }
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!isNaN(to.getTime())) {
        to.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
  }

  if (search && search.trim() !== "") {
    const term = search.trim();
    where.OR = [
      { eventId: { contains: term, mode: "insensitive" } },
      { userName: { contains: term, mode: "insensitive" } },
      { userId: { contains: term, mode: "insensitive" } },
      { action: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { entityId: { contains: term, mode: "insensitive" } },
      { failureReason: { contains: term, mode: "insensitive" } },
    ];
  }

  return where;
};

/**
 * GET /api/audit-logs
 * Paginated and filtered list of audit logs
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || req.query.limit, 10) || 25));
    const skip = (page - 1) * pageSize;

    const where = buildWhereClause(req.query);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error("getAuditLogs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit logs",
      error: error.message,
    });
  }
};

/**
 * GET /api/audit-logs/:id
 * Retrieve single audit log with full details
 */
exports.getAuditLogById = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await prisma.auditLog.findFirst({
      where: {
        OR: [{ id }, { eventId: id }],
      },
    });

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Audit log record not found",
      });
    }

    // Safely parse JSON strings for frontend consumption
    const parseSafe = (val) => {
      if (!val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    };

    return res.json({
      success: true,
      data: {
        ...log,
        parsedOldValues: parseSafe(log.oldValues),
        parsedNewValues: parseSafe(log.newValues),
        parsedMetadata: parseSafe(log.metadata),
      },
    });
  } catch (error) {
    console.error("getAuditLogById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit log details",
      error: error.message,
    });
  }
};

/**
 * GET /api/audit-logs/stats
 * Aggregated statistics and distinct filter options
 */
exports.getAuditStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      totalEvents,
      todayEvents,
      successCount,
      failedCount,
      recentActions,
      recentModules,
    ] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      prisma.auditLog.count({
        where: { status: "SUCCESS" },
      }),
      prisma.auditLog.count({
        where: { status: "FAILED" },
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 30,
      }),
      prisma.auditLog.groupBy({
        by: ["module"],
        _count: { module: true },
        orderBy: { _count: { module: "desc" } },
        take: 20,
      }),
    ]);

    return res.json({
      success: true,
      stats: {
        totalEvents,
        todayEvents,
        successCount,
        failedCount,
        successEvents: successCount,
        failedEvents: failedCount,
        actions: recentActions.map((a) => a.action),
        modules: recentModules.map((m) => m.module),
      },

    });
  } catch (error) {
    console.error("getAuditStats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch audit statistics",
      error: error.message,
    });
  }
};

/**
 * GET /api/audit-logs/export
 * Export audit logs to CSV and audit the export action
 */
exports.exportAuditLogs = async (req, res) => {
  try {
    const where = buildWhereClause(req.query);

    // Limit to 5000 records per export
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // Record audit event for the export operation
    await auditLogService.record({
      req,
      action: "DATA_EXPORTED",
      eventType: "EXPORT",
      module: "ADMIN_ACTIONS",
      entityType: "AUDIT_LOG",
      description: `Exported ${logs.length} audit records to CSV`,
      metadata: {
        filters: req.query,
        count: logs.length,
      },
    });

    // Format to CSV
    const csvHeaders = [
      "Event ID",
      "Timestamp (UTC)",
      "User Name",
      "User ID",
      "Role",
      "Application",
      "Action",
      "Module",
      "Entity Type",
      "Entity ID",
      "Vehicle Number",
      "Route Name",
      "Latitude",
      "Longitude",
      "GPS Accuracy (m)",
      "Location Status",
      "Status",
      "Description",
      "Failure Reason",
      "IP Address",
      "Device ID",
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""').replace(/\r?\n/g, " ");
      return `"${val}"`;
    };

    const csvRows = [
      csvHeaders.join(","),
      ...logs.map((log) =>
        [
          escapeCsv(log.eventId),
          escapeCsv(log.createdAt.toISOString()),
          escapeCsv(log.userName),
          escapeCsv(log.userId),
          escapeCsv(log.userRole),
          escapeCsv(log.appName),
          escapeCsv(log.action),
          escapeCsv(log.module),
          escapeCsv(log.entityType),
          escapeCsv(log.entityId),
          escapeCsv(log.vehicleNumber || log.vehicleId),
          escapeCsv(log.routeName || log.routeId),
          escapeCsv(log.latitude),
          escapeCsv(log.longitude),
          escapeCsv(log.gpsAccuracy),
          escapeCsv(log.locationStatus),
          escapeCsv(log.status),
          escapeCsv(log.description),
          escapeCsv(log.failureReason),
          escapeCsv(log.ipAddress),
          escapeCsv(log.deviceId),
        ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("exportAuditLogs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to export audit logs",
      error: error.message,
    });
  }
};
