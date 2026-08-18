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
