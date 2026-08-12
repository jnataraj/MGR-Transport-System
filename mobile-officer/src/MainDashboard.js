import React from "react";
import { useMainDashboard } from "./hooks/useMainDashboard";
import { DASHBOARD_ROLES } from "./constants/dashboard.constants";

import DriverDashboard from "./screens/DriverDashboard/DriverDashboard";
import CoordinatorDashboard from "./screens/CoordinatorDashboard/CoordinatorDashboard";
import MaintenanceDashboard from "./screens/MaintenanceDashboard/MaintenanceDashboard";

export default function MainDashboard(props) {
  const dashboard = useMainDashboard(props);

  switch (dashboard.role) {
    case DASHBOARD_ROLES.MAINTENANCE:
      return <MaintenanceDashboard dashboard={dashboard} />;

    case DASHBOARD_ROLES.COORDINATOR:
      return <CoordinatorDashboard dashboard={dashboard} />;

    case DASHBOARD_ROLES.DRIVER:
    default:
      return <DriverDashboard dashboard={dashboard} />;
  }
}
