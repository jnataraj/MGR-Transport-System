export const HOD_STATS = {
  total: 450,
  present: 412,
  absent: 38,
  qrMissed: 12,
  internalLeave: 5,
  busBreakdown: 3,
  medical: 2,
};

export const DEPT_VEHICLES = [
  {
    id: "BUS-07",
    route: "Theni via City",
    status: "LIVE",
    students: 42,
    driver: "Rajan Kumar",
  },
  {
    id: "BUS-12",
    route: "Ambattur via Avadi",
    status: "STATIONARY",
    students: 35,
    driver: "Prakash R.",
  },
  {
    id: "BUS-01",
    route: "Koyambedu direct",
    status: "BREAKDOWN",
    students: 28,
    driver: "Murugan G.",
  },
];

export const DASHBOARD_ROLES = {
  HOD: "hod",
  MAINTENANCE: "maintenance",
  COORDINATOR: "coordinator",
  DRIVER: "driver",
};
