const DEFAULT_TIMEOUT_MS = process.env.DRIVER_ACTIVE_TIMEOUT_MS
    ? parseInt(process.env.DRIVER_ACTIVE_TIMEOUT_MS, 10)
    : 120000; // 2 minutes default

const vehicleLocations = new Map();
// Key: driverId -> { vehicleId, latitude, longitude, updatedAt }
const driverLocations = new Map();

const setVehicleLocation = (vehicleId, latitude, longitude, extra = {}) => {
    if (!vehicleId || latitude == null || longitude == null) return;
    const now = new Date();
    const entry = {
        vehicleId,
        vehicleNumber: extra.vehicleNumber || null,
        driverId: extra.driverId || null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        speed: extra.speed != null ? parseFloat(extra.speed) : 0,
        heading: extra.heading != null ? parseFloat(extra.heading) : null,
        isHalted: !!extra.isHalted,
        updatedAt: now,
    };
    vehicleLocations.set(vehicleId, entry);
    if (extra.vehicleNumber && extra.vehicleNumber !== vehicleId) {
        vehicleLocations.set(extra.vehicleNumber, entry);
    }
    if (extra.driverId) {
        driverLocations.set(extra.driverId, entry);
        vehicleLocations.set(extra.driverId, entry);
    }
};

const getVehicleLocation = (vehicleId) => vehicleLocations.get(vehicleId) || null;
const getDriverLocation = (driverId) => driverLocations.get(driverId) || null;

// A driver counts as "online" if we've heard a GPS / heartbeat ping within the timeout threshold
const isVehicleOnline = (vehicleId, thresholdMs = DEFAULT_TIMEOUT_MS) => {
    const loc = vehicleLocations.get(vehicleId);
    if (!loc) return false;
    return Date.now() - loc.updatedAt.getTime() < thresholdMs;
};

const getAllOnlineVehicles = (thresholdMs = DEFAULT_TIMEOUT_MS) => {
    const onlineIds = [];
    const now = Date.now();
    for (const [key, loc] of vehicleLocations.entries()) {
        if (now - loc.updatedAt.getTime() < thresholdMs) {
            onlineIds.push(key);
        }
    }
    return onlineIds;
};

const clearVehicleLocation = (vehicleId) => {
    if (!vehicleId) return;
    const entry = vehicleLocations.get(vehicleId);
    if (entry) {
        if (entry.vehicleId) vehicleLocations.delete(entry.vehicleId);
        if (entry.vehicleNumber) vehicleLocations.delete(entry.vehicleNumber);
        if (entry.driverId) {
            vehicleLocations.delete(entry.driverId);
            driverLocations.delete(entry.driverId);
        }
    }
    vehicleLocations.delete(vehicleId);
};

/**
 * Haversine formula — returns the great-circle distance in **metres**
 * between two WGS-84 GPS coordinates.
 *
 * Accurate to ~0.5 % over short distances (well within ±1 m at 200 m range).
 *
 * @param {number} lat1  Student latitude
 * @param {number} lon1  Student longitude
 * @param {number} lat2  Vehicle latitude
 * @param {number} lon2  Vehicle longitude
 * @returns {number} Distance in metres
 */
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6_371_000; // Earth's mean radius in metres
    const toRad = (deg) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

module.exports = {
    setVehicleLocation,
    getVehicleLocation,
    getDriverLocation,
    isVehicleOnline,
    getAllOnlineVehicles,
    clearVehicleLocation,
    calculateDistanceMeters,
    DEFAULT_TIMEOUT_MS,
};