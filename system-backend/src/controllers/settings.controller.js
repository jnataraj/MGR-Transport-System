
const { PrismaClient } = require("../../generated/prisma");
const prisma = new PrismaClient();
const auditLogService = require("../services/auditLogService");

// Singleton row — settings always live at id = "singleton".
const SETTINGS_ID = "singleton";
const DEFAULTS = {
    id: SETTINGS_ID,
    gpsMismatchRadius: 50,
    gpsLogInterval: 10,
    googleMapsApiKey: "",
    systemEmail: "",
};

/**
 * GET /api/settings
 * Returns the single settings row, creating it with defaults on first run.
 */
const getSettings = async (req, res) => {
    try {
        let settings = await prisma.systemSettings.findUnique({
            where: { id: SETTINGS_ID },
        });
        if (!settings) {
            settings = await prisma.systemSettings.create({ data: DEFAULTS });
        }
        res.json({ success: true, settings });
    } catch (err) {
        console.error("getSettings error", err);
        res.status(500).json({ success: false, error: "Failed to load settings" });
    }
};

/**
 * PUT /api/settings/gps
 * Body: { gpsMismatchRadius?, gpsLogInterval?, googleMapsApiKey? }
 */
const updateGpsConfig = async (req, res) => {
    try {
        const { gpsMismatchRadius, gpsLogInterval, googleMapsApiKey } = req.body;

        const previousSettings = await prisma.systemSettings.findUnique({
            where: { id: SETTINGS_ID },
        });

        const patch = {
            ...(gpsMismatchRadius !== undefined && {
                gpsMismatchRadius: Number(gpsMismatchRadius),
            }),
            ...(gpsLogInterval !== undefined && {
                gpsLogInterval: Number(gpsLogInterval),
            }),
            ...(googleMapsApiKey !== undefined && { googleMapsApiKey }),
        };

        const settings = await prisma.systemSettings.upsert({
            where: { id: SETTINGS_ID },
            update: patch,
            create: { ...DEFAULTS, ...patch },
        });

        // Let connected dashboards / driver apps know config changed live.
        const io = req.app.get("io");
        if (io) io.emit("systemSettingsUpdated", settings);

        await auditLogService.record({
            req,
            action: "SETTING_UPDATED",
            eventType: "UPDATE",
            module: "SETTINGS",
            entityType: "SYSTEM_SETTINGS",
            entityId: SETTINGS_ID,
            description: `Updated GPS system settings (Radius: ${settings.gpsMismatchRadius}m, Interval: ${settings.gpsLogInterval}s)`,
            oldValues: {
                gpsMismatchRadius: previousSettings?.gpsMismatchRadius,
                gpsLogInterval: previousSettings?.gpsLogInterval,
            },
            newValues: {
                gpsMismatchRadius: settings.gpsMismatchRadius,
                gpsLogInterval: settings.gpsLogInterval,
            },
        });

        res.json({ success: true, settings });
    } catch (err) {
        console.error("updateGpsConfig error", err);
        res.status(500).json({ success: false, error: "Failed to update GPS config" });
    }
};

/**
 * PUT /api/settings/system
 * Body: { systemEmail? }
 */
const updateSystemConfig = async (req, res) => {
    try {
        const { systemEmail } = req.body;

        const previousSettings = await prisma.systemSettings.findUnique({
            where: { id: SETTINGS_ID },
        });

        const patch = {
            ...(systemEmail !== undefined && { systemEmail }),
        };

        const settings = await prisma.systemSettings.upsert({
            where: { id: SETTINGS_ID },
            update: patch,
            create: { ...DEFAULTS, ...patch },
        });

        const io = req.app.get("io");
        if (io) io.emit("systemSettingsUpdated", settings);

        await auditLogService.record({
            req,
            action: "SETTING_UPDATED",
            eventType: "UPDATE",
            module: "SETTINGS",
            entityType: "SYSTEM_SETTINGS",
            entityId: SETTINGS_ID,
            description: `Updated system email setting: ${systemEmail}`,
            oldValues: { systemEmail: previousSettings?.systemEmail },
            newValues: { systemEmail: settings.systemEmail },
        });

        res.json({ success: true, settings });
    } catch (err) {
        console.error("updateSystemConfig error", err);
        res.status(500).json({ success: false, error: "Failed to update system config" });
    }
};

module.exports = { getSettings, updateGpsConfig, updateSystemConfig };