const bcrypt = require("bcryptjs");
const prisma = require("../prisma/prisma");

const ADMIN_ROLE = "deptadmin";

const formatAdmin = (user) => {
    const { password, ...rest } = user;
    let permissions = [];
    try {
        permissions = JSON.parse(user.permissions || "[]");
    } catch {
        permissions = [];
    }
    return { ...rest, permissions };
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
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error("deleteAdmin error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Admin not found" });
        }
        res.status(500).json({ error: "Failed to delete admin" });
    }
};