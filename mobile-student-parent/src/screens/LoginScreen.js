import { KeyboardAvoidingView, Platform, SafeAreaView } from "react-native";
import LoginForm from "../components/auth/LoginForm";
import ServerStatusView from "../components/auth/ServerStatusView";
import useLogin from "../hooks/useLogin";
import styles from "../styles/login.styles";

export default function LoginScreen() {
  const loginState = useLogin();

  if (loginState.serverStatus !== "online") {
    return (
      <ServerStatusView
        status={loginState.serverStatus}
        error={loginState.serverError}
        apiBase={loginState.apiBase}
        onRetry={loginState.retryConnection}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <LoginForm
          selectedRole={loginState.selectedRole}
          onRoleChange={loginState.setSelectedRole}
          email={loginState.email}
          onEmailChange={loginState.setEmail}
          password={loginState.password}
          onPasswordChange={loginState.setPassword}
          isSubmitting={loginState.isSubmitting}
          onSubmit={loginState.handleLogin}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
