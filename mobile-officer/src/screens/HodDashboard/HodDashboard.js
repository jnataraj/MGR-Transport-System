import React from "react";
import { Alert, FlatList, SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { HOD_STATS, DEPT_VEHICLES } from "../../constants/dashboard.constants";
import ReasonPill from "../../components/ReasonPill";
import { styles } from "../../styles/dashboard.styles";

export default function HodDashboard({ dashboard }) {
  const { user, userName, confirmLogout } = dashboard;

return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        {/* HOD Header */}
        <View
          style={[styles.homeHdr, { backgroundColor: "#7C3AED", height: 120 }]}
        >
          <View style={[styles.profileImgWrap, { borderColor: "#DDD6FE" }]}>
            <Text style={{ fontSize: 28 }}>👨‍🏫</Text>
          </View>
          <View style={styles.hdrMainInfo}>
            <Text style={styles.hdrRole}>Head of Department</Text>
            <Text style={styles.hdrName}>{userName}</Text>
            <Text
              style={{
                fontSize: 10,
                color: "#DDD6FE",
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {(user?.department || "DEPARTMENT").toUpperCase()} | {user?.email}
            </Text>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              padding: 8,
              borderRadius: 8,
            }}
            onPress={confirmLogout}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
              LOGOUT
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ListHeaderComponent={() => (
            <>
              {/* Analytics Cards */}
              <View style={{ padding: 15 }}>
                <Text style={styles.sectionTitle}>ATTENDANCE ANALYTICS</Text>
                <View style={styles.statsGrid}>
                  <View
                    style={[
                      styles.statCard,
                      { borderLeftColor: "#7C3AED", borderLeftWidth: 4 },
                    ]}
                  >
                    <Text style={styles.statVal}>
                      {HOD_STATS.present}/{HOD_STATS.total}
                    </Text>
                    <Text style={styles.statLab}>Students Present</Text>
                  </View>
                  <View
                    style={[
                      styles.statCard,
                      { borderLeftColor: "#EF4444", borderLeftWidth: 4 },
                    ]}
                  >
                    <Text style={[styles.statVal, { color: "#EF4444" }]}>
                      {HOD_STATS.absent}
                    </Text>
                    <Text style={styles.statLab}>Reported Absent</Text>
                  </View>
                </View>

                <View style={styles.reasonRow}>
                  <ReasonPill
                    label="QR Missed"
                    count={HOD_STATS.qrMissed}
                    color="#F59E0B"
                  />
                  <ReasonPill
                    label="Breakdown"
                    count={HOD_STATS.busBreakdown}
                    color="#EF4444"
                  />
                  <ReasonPill
                    label="Medical"
                    count={HOD_STATS.medical}
                    color="#10B981"
                  />
                </View>
              </View>

              {/* Absentee List Header */}
              <View
                style={{
                  paddingHorizontal: 15,
                  marginBottom: 10,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={styles.sectionTitle}>GRANULAR ABSENTEE LIST</Text>
                <TouchableOpacity>
                  <Text
                    style={{
                      color: "#7C3AED",
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    EXPORT PDF
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          // data={ABSENTEE_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.absenteeTile}>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={styles.absName}>{item.name}</Text>
                  <Text style={styles.absId}>({item.id})</Text>
                </View>
                <Text style={styles.absBus}>Assigned: {item.bus}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <Text
                    style={[
                      styles.absReason,
                      {
                        color:
                          item.reason === "Bus Breakdown"
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    {item.reason}
                  </Text>
                  <Text style={styles.absStatus}>{item.status}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() =>
                  Alert.alert(
                    "Calling Parent",
                    `Connecting to ${item.phone}...`,
                  )
                }
              >
                <Text style={{ fontSize: 18 }}>📞</Text>
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={() => (
            <View style={{ padding: 15, paddingBottom: 40 }}>
              <Text style={styles.sectionTitle}>
                DEPARTMENT VEHICLE TRACKING
              </Text>
              {DEPT_VEHICLES.map((v) => (
                <View key={v.id} style={styles.vehicleTrackCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vNum}>
                      {v.id} - {v.route}
                    </Text>
                    <Text style={styles.vDetail}>
                      Driver: {v.driver} | {v.students} Students
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.vStatusPill,
                        {
                          backgroundColor:
                            v.status === "LIVE"
                              ? "#D1FAE5"
                              : v.status === "BREAKDOWN"
                                ? "#FEE2E2"
                                : "#F3F4F6",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.vStatusText,
                          {
                            color:
                              v.status === "LIVE"
                                ? "#065F46"
                                : v.status === "BREAKDOWN"
                                  ? "#B91C1C"
                                  : "#374151",
                          },
                        ]}
                      >
                        {v.status}
                      </Text>
                    </View>
                    <TouchableOpacity style={{ marginTop: 4 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#7C3AED",
                          fontWeight: "800",
                        }}
                      >
                        VIEW MAP
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      </SafeAreaView>
    );
}
