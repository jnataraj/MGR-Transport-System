const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");

exports.createIssue = async (req, res) => {
  try {
    const { type, description, vehicleId, reportedBy } = req.body;

    if (!type || !description || !reportedBy) {
      return res.status(400).json({ error: "type, description, and reportedBy are required" });
    }

    const issue = await prisma.issue.create({
      data: {
        type,
        description,
        vehicleId,
        reportedBy,
        status: "open",
      },
    });

    const io = req.app.get("io");
    // Trigger notification to admin / maintenance section
    try {
      await triggerNotification(io, {
        title: `New Driver Issue`,
        message: `Bus ${vehicleId || "N/A"} - ${type}`,
        type: "maintenance",
        sender: "Driver",
        target: "admin",
        data: { issueId: issue.id, vehicleId, type },
      });
    } catch (notifErr) {
      console.error("Failed to trigger notification for issue:", notifErr);
    }

    res.status(201).json(issue);
  } catch (err) {
    console.error("createIssue error:", err);
    res.status(500).json({ error: "Failed to create issue" });
  }
};

exports.resolveIssue = async (req, res) => {
  try {
    const { id } = req.params;

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        status: "resolved",
      },
    });

    res.json(issue);
  } catch (err) {
    console.error("resolveIssue error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Issue not found" });
    }
    res.status(500).json({ error: "Failed to resolve issue" });
  }
};
