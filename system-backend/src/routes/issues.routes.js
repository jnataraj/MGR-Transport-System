const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/issues.controller");
const { optionalToken } = require("../middleware/auth.middleware");

router.use(optionalToken);

router.post("/", ctrl.createIssue);
router.patch("/:id/resolve", ctrl.resolveIssue);

module.exports = router;

