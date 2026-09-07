const express = require("express");
const router = express.Router();
const routeController = require("../controllers/routeController");
const { optionalToken } = require("../middleware/auth.middleware");

router.use(optionalToken);

router.get("/", routeController.getRoutes);
router.post("/", routeController.createRoute);
router.put("/:id", routeController.updateRoute);
router.patch("/:id/deactivate", routeController.deactivateRoute);
router.delete("/:id", routeController.deleteRoute);

module.exports = router;

