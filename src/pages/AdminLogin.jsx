import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { loginAdmin } from "../lib/api.js";

const adminHighlights = [
  {
    icon: "shield_lock",
    title: "Secure control layer",
    description: "Protected access for approvals, credentials, and site operations.",
  },
  {
    icon: "apartment",
    title: "All libraries in one place",
    description: "Track pending, active, and suspended libraries from one console.",
  },
  {
    icon: "insights",
    title: "Live operational view",
    description: "Review registrations, contact requests, and content updates instantly.",
  },
];

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.body.classList.add("admin-auth-body");

    return () => {
      document.body.classList.remove("admin-auth-body");
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await loginAdmin(username.trim(), password);
      sessionStorage.setItem("lms_admin_token", data.token);
      toast.success("Login successful");
      navigate("/LMS-admin");
    } catch (err) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-orb admin-auth-orb-one"></div>
      <div className="admin-auth-orb admin-auth-orb-two"></div>

      <div className="admin-auth-grid">
        <section className="admin-auth-brand">
          <div className="admin-auth-badge">
            <span className="material-symbols-rounded icon-sm">verified_user</span>
            LibraryOS Admin Access
          </div>

          <h1 className="admin-auth-title">
            Manage registered libraries from one secure dashboard.
          </h1>

          <p className="admin-auth-copy">
            Approve registrations, issue credentials, monitor operations, and
            manage public content without leaving the admin workspace.
          </p>

          <div className="admin-auth-highlights">
            {adminHighlights.map((item) => (
              <div key={item.title} className="admin-auth-highlight">
                <div className="admin-auth-highlight-icon">
                  <span className="material-symbols-rounded">{item.icon}</span>
                </div>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="admin-auth-note">
            <span className="material-symbols-rounded icon-sm">route</span>
            Admin route: <strong>/LMS-admin/login</strong>
          </div>
        </section>

        <section className="admin-auth-card">
          <div className="admin-auth-card-top">
            <div className="admin-auth-logo">
              <span className="material-symbols-rounded">admin_panel_settings</span>
            </div>
            <div>
              <p className="admin-auth-eyebrow">Restricted login</p>
              <h2 className="admin-auth-card-title">Sign in to admin panel</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="admin-auth-form">
            <div className="form-group mb-0">
              <label className="form-label">Username</label>
              <input
                id="admin-username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                placeholder="Enter admin username"
                className="form-input admin-auth-input"
                autoComplete="username"
              />
            </div>

            <div className="form-group mb-0">
              <label className="form-label">Password</label>
              <div className="admin-auth-password">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter password"
                  className="form-input admin-auth-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="btn-icon admin-auth-visibility"
                  onClick={() => setShowPassword((value) => !value)}
                  tabIndex={-1}
                >
                  <span className="material-symbols-rounded">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="admin-auth-error">
                <span className="material-symbols-rounded icon-sm">error</span>
                <span>{error}</span>
              </div>
            )}

            <button
              id="admin-login-btn"
              type="submit"
              disabled={loading}
              className="btn btn-primary admin-auth-submit"
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Authenticating...
                </>
              ) : (
                <>
                  Login to dashboard
                  <span className="material-symbols-rounded icon-sm">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          <div className="admin-auth-footer">
            <a href="/" className="admin-auth-backlink">
              <span className="material-symbols-rounded icon-sm">arrow_back</span>
              Back to website
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
