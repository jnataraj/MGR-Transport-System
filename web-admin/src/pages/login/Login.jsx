import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";
import logo from "../../assets/logo.png";
import { login } from "../../services/authService";
import { AuthContext } from "../../context/AuthContext";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const { loginUser } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);

    try {
      const response = await login({
        email,
        password,
      });

      loginUser(response.data.user, response.data.token);

      navigate("/dashboard");
    } catch (error) {
      alert(error.response?.data?.message || "Login Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="left-panel">
          <div className="left-panel-glow" />
          <img
            src={logo}
            alt="CTMS Logo"
            style={{
              width: "100%",
              marginBottom: "20px",
              borderRadius: "6px",
              backgroundColor: "#fff",
              padding: "10px",
            }}
          />

          <h1>COLLEGE TRANSPORT</h1>
          <h1>MONITORING SYSTEM</h1>
          {/* <p>Dr. M.G.R. Educational and Research Institute</p> */}
        </div>

        <div className="right-panel">
          <h2 className="login-title">Member Login</h2>
          <p className="login-subtitle">
            Sign in to continue to your dashboard
          </p>

          <form onSubmit={handleLogin}>
            <div className="input-box">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-box">
              <Lock size={18} className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <div className="forgot">
              <a href="#">Forgot Password?</a>
            </div>

            <button className="login-btn" type="submit" disabled={loading}>
              <LogIn size={18} />
              {loading ? "Signing In..." : "LOGIN"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
