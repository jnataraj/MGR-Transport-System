const express = require("express");
const router = express.Router();
const auditLogController = require("../controllers/auditLog.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

// All audit log endpoints require valid authentication and admin authorization
router.use(verifyToken);
router.use(requireAdmin);

router.get("/stats", auditLogController.getAuditStats);
router.get("/export", auditLogController.exportAuditLogs);
router.get("/", auditLogController.getAuditLogs);
router.get("/:id", auditLogController.getAuditLogById);

module.exports = router;
