import React from "react";
import { View, Text, TextInput } from "react-native";
import styles from "../../styles/login.styles";

export default function InputField({ icon, ...props }) {
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputIcon}>{icon}</Text>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
      />
    </View>
  );
}
