const prisma = require("../prisma/prisma");

const formatSection = (section, adminCountMap = {}) => ({
    id: section.id,
    name: section.name,
    color: section.color,
    incharge: section.incharge
        ? {
            id: section.incharge.id,
            name: section.incharge.name,
            email: section.incharge.email,
        }
        : null,
    inchargeCount: section.incharge ? 1 : 0,
    adminCount: adminCountMap[section.name] || 0,
    createdAt: section.createdAt,
});

// GET /api/admin-sections
exports.getSections = async (req, res) => {
    try {
        const sections = await prisma.adminSection.findMany({
            include: { incharge: true },
            orderBy: { createdAt: "asc" },
        });

        // Count how many admins are assigned to each sector name
        const admins = await prisma.user.findMany({
            where: { role: "deptadmin" },
            select: { sector: true },
        });
        const adminCountMap = admins.reduce((acc, a) => {
            if (a.sector) acc[a.sector] = (acc[a.sector] || 0) + 1;
            return acc;
        }, {});

        res.json(sections.map((s) => formatSection(s, adminCountMap)));
    } catch (err) {
        console.error("getSections error:", err);
        res.status(500).json({ error: "Failed to fetch admin sections" });
    }
};

// POST /api/admin-sections
exports.createSection = async (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Section name is required" });
        }

        const section = await prisma.adminSection.create({
            data: { name: name.trim(), color: color || "#3B82F6" },
            include: { incharge: true },
        });
        res.status(201).json(formatSection(section));
    } catch (err) {
        console.error("createSection error:", err);
        if (err.code === "P2002") {
            return res
                .status(409)
                .json({ error: "A section with this name already exists" });
        }
        res.status(500).json({ error: "Failed to create admin section" });
    }
};

// PUT /api/admin-sections/:id
exports.updateSection = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, inchargeId } = req.body;

        const section = await prisma.adminSection.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(inchargeId !== undefined && { inchargeId: inchargeId || null }),
            },
            include: { incharge: true },
        });
        res.json(formatSection(section));
    } catch (err) {
        console.error("updateSection error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Section not found" });
        }
        res.status(500).json({ error: "Failed to update admin section" });
    }
};

// DELETE /api/admin-sections/:id
exports.deleteSection = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.adminSection.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error("deleteSection error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Section not found" });
        }
        res.status(500).json({ error: "Failed to delete admin section" });
    }
};

// POST /api/admin-sections/:id/incharge  { userId }
exports.setIncharge = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "userId is required" });
        }

        const section = await prisma.adminSection.update({
            where: { id },
            data: { inchargeId: userId },
            include: { incharge: true },
        });
        res.json(formatSection(section));
    } catch (err) {
        console.error("setIncharge error:", err);
        res.status(500).json({ error: "Failed to assign incharge" });
    }
};

// DELETE /api/admin-sections/:id/incharge
exports.removeIncharge = async (req, res) => {
    try {
        const { id } = req.params;
        const section = await prisma.adminSection.update({
            where: { id },
            data: { inchargeId: null },
            include: { incharge: true },
        });
        res.json(formatSection(section));
    } catch (err) {
        console.error("removeIncharge error:", err);
        res.status(500).json({ error: "Failed to remove incharge" });
    }
};