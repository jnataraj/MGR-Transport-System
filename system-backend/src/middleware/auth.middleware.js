const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Access Denied",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // NEW — log the real reason during dev so you're not guessing
    console.log("Auth failure:", error.name, "-", error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token Expired",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid Token",
    });
  }
};

/**
 * Middleware that extracts user token if present, but doesn't reject if absent
 */
exports.optionalToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (error) {
    // Ignore invalid token on optional routes
  }
  next();
};

/**
 * Restricts access to Admin roles (superadmin, admin, deptadmin)
 */
exports.requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const role = (req.user.role || "").toLowerCase();
  const allowedAdminRoles = ["superadmin", "admin", "deptadmin"];

  if (!allowedAdminRoles.includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Admin access required",
    });
  }

  next();
};