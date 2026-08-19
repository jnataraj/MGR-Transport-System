import React, { useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  Platform,
} from "react-native";
import styles from "../styles/modal.styles";

// ── Profile image avatar ───────────────────────────────────────────────────
export const ProfileAvatar = ({ user }) => {
  const [imageError, setImageError] = useState(false);

  const rawImage = user?.image;
  const imageUri = rawImage
    ? (rawImage.startsWith("data:") ? rawImage : `data:image/jpeg;base64,${rawImage}`)
    : null;

  const hasImage = !!imageUri && !imageError;

  const initials = (user?.name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  return (
    <View style={avatarStyles.wrapper}>
      {hasImage ? (
        <Image
          source={{ uri: imageUri }}
          style={avatarStyles.image}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      ) : (
        <View style={avatarStyles.fallback}>
          <Text style={avatarStyles.initials}>{initials}</Text>
        </View>
      )}
    </View>
  );
};

// ── Detail field ───────────────────────────────────────────────────────────
const Field = ({ label, value }) => (
  <View style={{ flex: 1, marginBottom: 14 }}>
    <Text style={{ fontSize: 9, fontWeight: "900", color: "#94A3B8" }}>{label}</Text>
    <Text style={{ fontSize: 12, fontWeight: "800", color: "#1E293B", marginTop: 3 }}>{value || "—"}</Text>
  </View>
);

// ── ProfileModal ───────────────────────────────────────────────────────────
export default function ProfileModal({ visible, user, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 14 }}>

          {/* ── Profile image hero ───────────────────────────────────── */}
          <View style={avatarStyles.heroCard}>
            <ProfileAvatar user={user} />
            <Text style={avatarStyles.heroName}>{user?.name || "—"}</Text>
            <Text style={avatarStyles.heroRole}>STUDENT ACCOUNT</Text>
          </View>

          {/* ── Personal Details ─────────────────────────────────────── */}
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>PERSONAL DETAILS</Text>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="NAME" value={user?.name} /><Field label="EMAIL" value={user?.email} /></View>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="DEPARTMENT" value={user?.department} /><Field label="YEAR" value={user?.year} /></View>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="ROLL / ID" value={user?.rollNumber || user?.id} /><Field label="BLOOD GROUP" value={user?.bloodGroup} /></View>
          </View>

          {/* ── Transit Subscription ─────────────────────────────────── */}
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>TRANSIT SUBSCRIPTION</Text>
            <Field label="ROUTE / BUS NO." value={user?.route || user?.vehicle} />
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="PICKUP POINT" value={user?.pickupPoint} /><Field label="EST. TIME" value={user?.pickupTime} /></View>
          </View>

          {/* ── Emergency / Parent Contact ────────────────────────────── */}
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>EMERGENCY / PARENT CONTACT</Text>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="FATHER NAME" value={user?.fatherName} /><Field label="CONTACT NO." value={user?.fatherContact} /></View>
            <Field label="MOTHER NAME & CONTACT" value={`${user?.motherName || "—"}${user?.motherContact ? ` (${user.motherContact})` : ""}`} />
          </View>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Avatar / hero styles ───────────────────────────────────────────────────
const AVATAR_SIZE = 96;

export const avatarStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  wrapper: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#DBEAFE",
    shadowColor: "#2563EB",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
  },
  fallback: {
    width: "100%",
    height: "100%",
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 4,
  },
  heroRole: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 1.4,
    textAlign: "center",
  },
});
