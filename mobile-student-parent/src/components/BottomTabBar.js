import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Home, User, Settings } from "lucide-react-native";

const TABS = [
    { key: "home", label: "Home", Icon: Home },
    { key: "profile", label: "Profile", Icon: User },
    { key: "settings", label: "Settings", Icon: Settings },
];

export default function BottomTabBar({ activeTab, onTabPress }) {
    return (
        <View style={styles.container}>
            {TABS.map(({ key, label, Icon }) => {
                const isActive = activeTab === key;
                return (
                    <TouchableOpacity
                        key={key}
                        style={styles.tabBtn}
                        activeOpacity={0.7}
                        onPress={() => onTabPress(key)}
                    >
                        <Icon
                            size={22}
                            color={isActive ? "#2563EB" : "#9CA3AF"}
                            strokeWidth={isActive ? 2.4 : 2}
                        />
                        <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
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
    tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
    label: { fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
    labelActive: { color: "#2563EB", fontWeight: "900" },
});
