import React, { useState } from "react";
import { SafeAreaView, View } from "react-native";
import BottomTabBar from "../../components/BottomTabBar";
import LiveBusTrackingModal from "../../components/LiveBusTrackingModal";
import useMainDashboard from "../../hooks/useMainDashboard";
import StudentDashboard from "./roles/StudentDashboard";
import ParentDashboard from "./roles/ParentDashboard";
import HodDashboard from "./roles/HodDashboard";
import BoardingQRModal from "./modals/BoardingQRModal";
import TravelHistoryModal from "./modals/TravelHistoryModal";
import RouteAlertsModal from "./modals/RouteAlertsModal";
import SettingsModal from "./modals/SettingsModal";
import ProfileModal from "./modals/ProfileModal";
import AbsentStudentsModal from "./modals/AbsentStudentsModal";
import { normalizeRole } from "../../utils/roleUtils";

export default function MainDashboard({ user, token, onLogout }) {
  const dashboard = useMainDashboard({ user, token, onLogout });
  const [absentVisible, setAbsentVisible] = useState(false);

  const role = normalizeRole(user?.role);

  const exportAttendanceReport = () => {
    import("react-native").then(({ Alert }) => {
      Alert.alert("Export", "Generating HoD Attendance Report PDF...");
    });
  };

  const renderRoleDashboard = () => {
    if (role === "parent") {
      return <ParentDashboard {...dashboard} />;
    }
    if (role === "hod") {
      return (
        <HodDashboard
          {...dashboard}
          openAbsentStudents={() => setAbsentVisible(true)}
          exportAttendanceReport={exportAttendanceReport}
        />
      );
    }
    return <StudentDashboard {...dashboard} />;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <View style={{ flex: 1 }}>
        {renderRoleDashboard()}

        <BottomTabBar
          activeTab={dashboard.activeTab}
          onTabPress={dashboard.handleTabPress}
        />

        <BoardingQRModal
          visible={dashboard.boardingQR.visible}
          attendance={dashboard.attendance}
          onClose={dashboard.closeBoardingQR}
        />

        <TravelHistoryModal
          visible={dashboard.travelHistory.visible}
          role={role}
          user={user}
          history={dashboard.travelHistory}
          onClose={dashboard.closeTravelHistory}
        />

        <RouteAlertsModal
          visible={dashboard.routeAlerts.visible}
          alerts={dashboard.routeAlerts.items}
          onClose={dashboard.closeRouteAlerts}
        />

        <SettingsModal
          visible={dashboard.settings.visible}
          gpsEnabled={dashboard.settings.gpsEnabled}
          onToggleGPS={dashboard.attendance.toggleGPS}
          onLogout={dashboard.confirmLogout}
          onClose={dashboard.closeSettings}
        />

        <ProfileModal
          visible={dashboard.profile.visible}
          user={user}
          onClose={dashboard.closeProfile}
        />

        <AbsentStudentsModal
          visible={absentVisible}
          summary={dashboard.department.allSummary}
          deptBreakdown={dashboard.department.allSummary.deptBreakdown}
          department={user?.department || "Department"}
          onClose={() => setAbsentVisible(false)}
        />

        {role !== "hod" && (
          <LiveBusTrackingModal
            visible={dashboard.liveMapVisible}
            onClose={() => dashboard.setLiveMapVisible(false)}
            user={user}
            token={token}
            socketRef={dashboard.socketRef}
            userRole={role}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
