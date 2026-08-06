import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Login from "./pages/login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import Vehicles from "./pages/vehicles/Vehicles";
import Drivers from "./pages/drivers/Drivers";
import Students from "./pages/students/Students";
import Parents from "./pages/parent/Parents";
import Coordinators from "./pages/Coordinator/Coordinators";
import HoDs from "./pages/hod/HoDs";
import RoutesPage from "./pages/route/Routes";
import Notifications from "./pages/notifications/Notifications";
import Admins from "./pages/AdminSection/admins";
import Maintenance from "./pages/maintenance/Maintenance";
import BusChange from "./pages/busChange/BusChange";
import Settings from "./pages/settings/Settings";

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admins" element={<Admins />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/students" element={<Students />} />
          <Route path="/parents" element={<Parents />} />
          <Route path="/coordinators" element={<Coordinators />} />
          <Route path="/hods" element={<HoDs />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/issues" element={<Maintenance />} />
          <Route path="/bus-change" element={<BusChange />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
