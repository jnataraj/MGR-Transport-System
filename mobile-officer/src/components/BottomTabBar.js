import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function BottomTabBar({ activeTab, onTabPress }) {
    const tabs = [
        { key: "home", label: "Home", icon: "🏠" },
        { key: "profile", label: "Profile", icon: "👤" },
        { key: "settings", label: "Settings", icon: "⚙️" },
    ];

    return (
        <View style={styles.container}>
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tabBtn}
                        activeOpacity={0.7}
                        onPress={() => onTabPress(tab.key)}
                    >
                        <Text style={[styles.icon, isActive && styles.iconActive]}>
                            {tab.icon}
                        </Text>
                        <Text style={[styles.label, isActive && styles.labelActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: "row",
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
        paddingTop: 8,
        paddingBottom: 10,
    },
    tabBtn: { flex: 1, alignItems: "center", justifyContent: "center" },
    icon: { fontSize: 20, marginBottom: 2, opacity: 0.5 },
    iconActive: { opacity: 1 },
    label: { fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
    labelActive: { color: "#2563EB", fontWeight: "900" },
});
