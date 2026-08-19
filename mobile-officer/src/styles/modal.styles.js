import { StyleSheet } from "react-native";

export const subModalStyles = StyleSheet.create({
  optionBtn: {
    width: "100%",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  optionBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
  optionBtnPrimary: {
    backgroundColor: "#2563EB",
  },
  optionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },
  cameraCloseBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraCloseBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
});


export default StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { paddingBottom: 40 },
  logoWrap: { alignItems: "center", marginBottom: 10 },
  logo: { height: 90, width: 250 },

  header: {
    backgroundColor: "#1D4ED8",
    borderRadius: 22,
    padding: 18,
    margin: 16,
    shadowColor: "#1D4ED8",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  headerRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#FFF",
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  roleText: { fontSize: 10, fontWeight: "900", color: "#93C5FD", letterSpacing: 1, textTransform: "uppercase" },
  nameText: { fontSize: 18, fontWeight: "900", color: "#FFF", marginTop: 2 },
  subText: { fontSize: 11, fontWeight: "700", color: "#BFDBFE", marginTop: 2 },
  subTextRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  headerRight: { alignItems: "flex-end" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "900", color: "#FFF" },
  routeText: { fontSize: 11, fontWeight: "800", color: "#FFF", marginTop: 8, textAlign: "right" },

  // Action grid
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 6 },
  actionWrap: { width: "48%", position: "relative" },
  action: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  actionIconWrap: {
    width: 46, height: 46, borderRadius: 13,
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  actionText: { fontSize: 13, fontWeight: "800", color: "#1E293B", lineHeight: 17 },
  actionChevron: {
    position: "absolute", right: 12, bottom: 12,
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  badge: {
    position: "absolute", top: 4, right: 4, backgroundColor: "#EF4444",
    borderRadius: 10, minWidth: 20, height: 20, alignItems: "center",
    justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: "#FFF",
  },
  badgeText: { color: "#FFF", fontSize: 10, fontWeight: "900" },

  card: {
    backgroundColor: "#FFF", borderRadius: 20, padding: 18, marginHorizontal: 16,
    marginBottom: 16, borderWidth: 1, borderColor: "#F1F5F9",
    shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  blueCard: {
    backgroundColor: "#1E40AF", borderRadius: 20, padding: 20, marginHorizontal: 16,
    marginBottom: 16, overflow: "hidden",
    shadowColor: "#1E40AF", shadowOpacity: 0.3, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  cardLabel: { fontSize: 10, fontWeight: "900", color: "#94A3B8", letterSpacing: 1 },
  blueLabel: { color: "#93C5FD" },
  cardTitle: { fontSize: 20, fontWeight: "900", color: "#FFF", marginTop: 4 },
  cardBody: { fontSize: 12, fontWeight: "600", color: "#DBEAFE", marginTop: 6 },

  stageIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 14 },
  stageIconText: { fontSize: 24 },
  stageTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 2 },
  stageLabel: { fontSize: 15, fontWeight: "900", lineHeight: 18 },

  reminder: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginTop: 12,
    borderLeftWidth: 3, borderLeftColor: "#EF4444",
  },
  reminderText: { fontSize: 11, fontWeight: "800", color: "#DC2626", flexShrink: 1 },

  progressTitle: { fontSize: 11, fontWeight: "900", color: "#94A3B8", letterSpacing: 1, marginBottom: 20 },
  progressTrack: { position: "absolute", top: 10, left: 20, right: 20, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2 },
  progressRow: { flexDirection: "row", justifyContent: "space-between" },
  progressDot: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#FFF",
    shadowColor: "#0F172A", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  progressItem: { alignItems: "center" },
  progressLabel: { fontSize: 10, fontWeight: "900", marginTop: 8 },
  progressSubLabel: { fontSize: 9, fontWeight: "700", color: "#94A3B8", marginTop: 2 },

  hodStats: { flexDirection: "row", marginHorizontal: 16, marginBottom: 16, gap: 8 },
  hodStat: {
    flex: 1, backgroundColor: "#FFF", borderRadius: 14, padding: 12,
    borderWidth: 1.5, alignItems: "center",
    shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  hodStatNum: { fontSize: 20, fontWeight: "900" },
  hodStatLabel: { fontSize: 9, fontWeight: "800", color: "#64748B", marginTop: 3, textAlign: "center" },
});