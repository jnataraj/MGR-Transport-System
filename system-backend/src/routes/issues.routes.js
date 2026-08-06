const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/issues.controller");

router.post("/", ctrl.createIssue);
router.patch("/:id/resolve", ctrl.resolveIssue);

module.exports = router;
