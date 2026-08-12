import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import RoleSelector from "./RoleSelector";
import InputField from "./InputField";
import styles from "../../styles/login.styles";

export default function LoginForm({ selectedRole, onRoleChange, email, onEmailChange, password, onPasswordChange, isSubmitting, onSubmit }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dr MGR Academic &{"\n"}Student Portal</Text>
      <View style={styles.titleUnderline} />

      <RoleSelector selectedRole={selectedRole} onChange={onRoleChange} />

      <InputField
        icon="👤"
        placeholder="Email address"
        keyboardType="email-address"
        value={email}
        onChangeText={onEmailChange}
      />

      <InputField
        icon="🔒"
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={onPasswordChange}
      />

      <TouchableOpacity
        style={[styles.loginBtn, isSubmitting && styles.loginBtnDisabled]}
        onPress={onSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Login Securely</Text>}
      </TouchableOpacity>
    </View>
  );
}
