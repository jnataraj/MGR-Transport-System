const express = require("express");
const router = express.Router();
const users = require("../controllers/users.controller");

router.get("/", users.getUsers);
router.get("/:id", users.getUser);
router.post("/", users.createUser);
router.put("/:id", users.updateUser);
router.delete("/:id", users.deleteUser);

module.exports = router;
