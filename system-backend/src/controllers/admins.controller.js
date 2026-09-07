const bcrypt = require("bcryptjs");
const prisma = require("../prisma/prisma");
const auditLogService = require("../services/auditLogService");

const ADMIN_ROLE = "deptadmin";

const formatAdmin = (user) => {
    const { password, plainPassword, ...rest } = user;
    let permissions = [];
    try {
        permissions = JSON.parse(user.permissions || "[]");
    } catch {
        permissions = [];
    }
    const effectivePassword = plainPassword || (password && !password.startsWith("$2b$") ? password : "123456");
    return {
        ...rest,
        password: effectivePassword,
        plainPassword: effectivePassword,
        permissions,
    };
};

// GET /api/admins
exports.getAdmins = async (req, res) => {
    try {
        const admins = await prisma.user.findMany({
            where: { role: ADMIN_ROLE },
            orderBy: { createdAt: "desc" },
        });
        res.json(admins.map(formatAdmin));
    } catch (err) {
        console.error("getAdmins error:", err);
        res.status(500).json({ error: "Failed to fetch admins" });
    }
};

// GET /api/admins/:id
exports.getAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const admin = await prisma.user.findUnique({ where: { id } });
        if (!admin || admin.role !== ADMIN_ROLE) {
            return res.status(404).json({ error: "Admin not found" });
        }
        res.json(formatAdmin(admin));
    } catch (err) {
        console.error("getAdmin error:", err);
        res.status(500).json({ error: "Failed to fetch admin" });
    }
};

// POST /api/admins
exports.createAdmin = async (req, res) => {
    try {
        const {
            name,
            employeeId,
            phone,
            email,
            roleHeader,
            department,
            sector,
            permissions = [],
            loginId,
            password,
        } = req.body;

        if (!name || !email || !password) {
            return res
                .status(400)
                .json({ error: "Name, email and password are required" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const admin = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                plainPassword: password,
                role: ADMIN_ROLE,
                phone: phone || null,
                employeeId: employeeId || null,
                roleHeader: roleHeader || "Dept Admin",
                department: department || null,
                sector: sector || null,
                permissions: JSON.stringify(permissions || []),
                loginId: loginId || null,
                status: "active",
            },
        });

        await auditLogService.record({
            req,
            action: "ADMIN_CREATED",
            eventType: "CREATE",
            module: "USER_MANAGEMENT",
            entityType: "ADMIN",
            entityId: admin.id,
            description: `Created admin account ${name} (Sector: ${sector || "General"}, Header: ${roleHeader || "Dept Admin"})`,
            newValues: {
                name,
                email,
                sector,
                roleHeader,
                employeeId,
                permissions,
            },
        });

        res.status(201).json(formatAdmin(admin));
    } catch (err) {
        console.error("createAdmin error:", err);
        if (err.code === "P2002") {
            return res
                .status(409)
                .json({ error: "Email or Web Login ID already exists" });
        }
        res.status(500).json({ error: "Failed to create admin" });
    }
};

// PUT /api/admins/:id
exports.updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            employeeId,
            phone,
            email,
            roleHeader,
            department,
            sector,
            permissions,
            loginId,
            password,
            status,
        } = req.body;

        const previousAdmin = await prisma.user.findUnique({
            where: { id },
        });

        if (!previousAdmin) {
            return res.status(404).json({ error: "Admin not found" });
        }

        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const admin = await prisma.user.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(email !== undefined && { email }),
                ...(phone !== undefined && { phone }),
                ...(employeeId !== undefined && { employeeId }),
                ...(roleHeader !== undefined && { roleHeader }),
                ...(department !== undefined && { department }),
                ...(sector !== undefined && { sector }),
                ...(permissions !== undefined && {
                    permissions: JSON.stringify(permissions || []),
                }),
                ...(loginId !== undefined && { loginId }),
                ...(status !== undefined && { status }),
                ...(hashedPassword !== undefined && { password: hashedPassword }),
                ...(password !== undefined && password !== "" && { plainPassword: password }),
            },
        });

        await auditLogService.record({
            req,
            action: "ADMIN_UPDATED",
            eventType: "UPDATE",
            module: "USER_MANAGEMENT",
            entityType: "ADMIN",
            entityId: id,
            description: `Updated admin account ${admin.name}`,
            oldValues: {
                name: previousAdmin.name,
                email: previousAdmin.email,
                sector: previousAdmin.sector,
                roleHeader: previousAdmin.roleHeader,
                status: previousAdmin.status,
            },
            newValues: {
                name: admin.name,
                email: admin.email,
                sector: admin.sector,
                roleHeader: admin.roleHeader,
                status: admin.status,
            },
        });

        res.json(formatAdmin(admin));
    } catch (err) {
        console.error("updateAdmin error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Admin not found" });
        }
        if (err.code === "P2002") {
            return res
                .status(409)
                .json({ error: "Email or Web Login ID already exists" });
        }
        res.status(500).json({ error: "Failed to update admin" });
    }
};

// DELETE /api/admins/:id
exports.deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await prisma.user.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Admin not found" });
        }

        await prisma.user.delete({ where: { id } });

        await auditLogService.record({
            req,
            action: "ADMIN_DELETED",
            eventType: "DELETE",
            module: "USER_MANAGEMENT",
            entityType: "ADMIN",
            entityId: id,
            description: `Deleted admin account ${existing.name} (${existing.email})`,
            oldValues: {
                id: existing.id,
                name: existing.name,
                email: existing.email,
                sector: existing.sector,
            },
        });

        res.json({ success: true });
    } catch (err) {
        console.error("deleteAdmin error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Admin not found" });
        }
        res.status(500).json({ error: "Failed to delete admin" });
    }
};