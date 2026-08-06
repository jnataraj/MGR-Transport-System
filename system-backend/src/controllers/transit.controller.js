const prisma = require("../prisma/prisma");

/**
 * Get transit summary for today
 * GET /api/transit/today
 */
exports.getTodaySummary = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];

    const records = await prisma.studentTransit.findMany({
      where: {
        date: todayStr,
      },
      select: {
        status: true,
      },
    });

    let inTransit = 0;
    let dropped = 0;

    records.forEach((r) => {
      const status = (r.status || "").toLowerCase();
      if (status.includes("transit")) {
        inTransit++;
      } else if (status.includes("drop")) {
        dropped++;
      }
    });

    return res.status(200).json({
      success: true,
      summary: {
        inTransit,
        dropped,
      },
    });
  } catch (error) {
    console.error("getTodaySummary Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch today's transit summary",
    });
  }
};

/**
 * Get transit history with filters
 * GET /api/transit
 */
exports.getTransitHistory = async (req, res) => {
  try {
    const { studentId, vehicleId, status, date, limit = 100 } = req.query;

    const where = {};
    if (studentId) where.studentId = studentId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (status) where.status = status;
    if (date) where.date = date;

    const history = await prisma.studentTransit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit, 10) || 100,
    });

    return res.status(200).json({
      success: true,
      transits: history,
    });
  } catch (error) {
    console.error("getTransitHistory Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch transit history",
    });
  }
};
