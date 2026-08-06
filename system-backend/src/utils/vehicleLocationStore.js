const vehicleLocations = new Map();

const setVehicleLocation = (vehicleId, latitude, longitude) => {
    if (!vehicleId || latitude == null || longitude == null) return;
    vehicleLocations.set(vehicleId, {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        updatedAt: new Date(),
    });
};

const getVehicleLocation = (vehicleId) => vehicleLocations.get(vehicleId) || null;

// A driver counts as "online" if we've heard a GPS ping in the last 45s.
const isVehicleOnline = (vehicleId, thresholdMs = 45000) => {
    const loc = vehicleLocations.get(vehicleId);
    if (!loc) return false;
    return Date.now() - loc.updatedAt.getTime() < thresholdMs;
};

const clearVehicleLocation = (vehicleId) => vehicleLocations.delete(vehicleId);

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

module.exports = { setVehicleLocation, getVehicleLocation, isVehicleOnline, clearVehicleLocation, calculateDistanceMeters };