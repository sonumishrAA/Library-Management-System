import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { format } from "date-fns";
import {
  getLibraries,
  generateCredentials,
  suspendLibrary,
  resetCredentials,
  getLibraryStats,
  getStudentsAdmin,
  deleteLibrary,
} from "../lib/api.js";
import AdminSiteContent from "../components/AdminSiteContent.jsx";
import AdminSupportTab from "../components/AdminSupportTab.jsx";

const MAIN_TABS = [
  { id: "libraries", label: "Libraries", icon: "apartment" },
  { id: "students", label: "Students", icon: "groups" },
  { id: "content", label: "Site Content", icon: "edit_note" },
  { id: "support", label: "Support", icon: "support_agent" },
];

const QUICK_FILTERS = [
  { id: "all", label: "All Libraries" },
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
];

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy");
}

function getStatusBadge(status) {
  if (status === "active") return "badge-active";
  if (status === "pending") return "badge-pending";
  if (status === "suspended") return "badge-suspended";
  return "badge-navy";
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("lms_admin_token");

  const [libraries, setLibraries] = useState([]);
  const [stats, setStats] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState("libraries");
  const [quickFilter, setQuickFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerLib, setDrawerLib] = useState(null);
  const [credModal, setCredModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [actionLoading, setActionLoading] = useState(null);

  const fetchLibraries = useCallback(async () => {
    try {
      setLoading(true);
      const [libData, statsData, studentsData] = await Promise.all([
        getLibraries(token, "all"),
        getLibraryStats(token).catch(() => null),
        getStudentsAdmin(token).catch(() => ({ students: [] })),
      ]);
      setLibraries(libData.libraries || []);
      if (statsData) setStats(statsData);
      if (studentsData && studentsData.students) setStudents(studentsData.students);
    } catch (err) {
      toast.error(err.message || "Failed to load libraries");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchLibraries();
  }, [fetchLibraries]);

  const handleLogout = () => {
    sessionStorage.removeItem("lms_admin_token");
    navigate("/LMS-admin/login");
  };

  const handleApprove = async (lib) => {
    setActionLoading(lib.id);
    try {
      const res = await generateCredentials(token, lib.id);
      setCredModal({
        login_id: res.login_id,
        password: res.plain_password,
        libraryName: lib.name,
      });
      await fetchLibraries();
      toast.success("Credentials generated");
    } catch (err) {
      toast.error(err.message || "Failed to approve library");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (lib) => {
    if (!window.confirm(`Suspend "${lib.name}"? They will lose access.`)) {
      return;
    }

    setActionLoading(lib.id);
    try {
      await suspendLibrary(token, lib.id);
      await fetchLibraries();
      toast.success("Library suspended");
    } catch (err) {
      toast.error(err.message || "Failed to suspend library");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetPassword = async (lib) => {
    if (!window.confirm(`Reset credentials for "${lib.name}"?`)) {
      return;
    }

    setActionLoading(lib.id);
    try {
      const res = await resetCredentials(token, lib.id);
      setCredModal({
        login_id: res.login_id,
        password: res.plain_password,
        libraryName: lib.name,
      });
      await fetchLibraries();
      toast.success("Credentials reset");
    } catch (err) {
      toast.error(err.message || "Failed to reset credentials");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteClick = (lib) => {
    setDeleteModal(lib);
    setDeleteInput("");
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    if (deleteInput !== deleteModal.name) {
      toast.error("Library name did not match. Deletion cancelled.");
      return;
    }

    setActionLoading(deleteModal.id);
    try {
      await deleteLibrary(token, deleteModal.id);
      await fetchLibraries();
      if (drawerLib?.id === deleteModal.id) {
        setDrawerLib(null);
      }
      toast.success(`"${deleteModal.name}" has been permanently deleted`);
      setDeleteModal(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete library");
    } finally {
      setActionLoading(null);
    }
  };

  const copyCredentials = () => {
    if (!credModal) return;

    const text = `Login ID: ${credModal.login_id}\nPassword: ${credModal.password}`;
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Credentials copied");
    });
  };

  const pendingLibraries = libraries.filter((lib) => lib.status === "pending");
  const activeLibraries = libraries.filter((lib) => lib.status === "active");
  const suspendedLibraries = libraries.filter(
    (lib) => lib.status === "suspended",
  );

  const filteredLibraries = libraries.filter((lib) => {
    const matchesFilter = quickFilter === "all" || lib.status === quickFilter;
    const needle = searchQuery.toLowerCase();
    const matchesSearch =
      !needle ||
      lib.name?.toLowerCase().includes(needle) ||
      lib.city?.toLowerCase().includes(needle) ||
      lib.state?.toLowerCase().includes(needle) ||
      lib.login_id?.toLowerCase().includes(needle);

    return matchesFilter && matchesSearch;
  });

  const getStudentsCount = (libId) => students.filter(s => s.library_id === libId).length;

  const totalSeats = libraries.reduce(
    (sum, lib) => sum + Number(lib.total_seats || 0),
    0,
  );
  const totalLockers = libraries.reduce(
    (sum, lib) => sum + Number(lib.total_lockers || 0),
    0,
  );
  const totalShifts = libraries.reduce(
    (sum, lib) => sum + (lib.shifts?.length || 0),
    0,
  );
  const coveredCities = new Set(
    libraries.map((lib) => lib.city).filter(Boolean),
  ).size;
  const recentLibraries = [...libraries]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const shiftLabelLookup = libraries.reduce((acc, lib) => {
    const labelsById = {};
    (lib.shifts || []).forEach((shift) => {
      if (shift?.id) labelsById[shift.id] = shift.label || "";
    });
    acc[lib.id] = labelsById;
    return acc;
  }, {});

  const getShiftLabelForMembership = (student, membership) => {
    if (!membership?.shift_id) return "";
    const fromStudentPayload = membership?.shifts?.label || membership?.shift?.label;
    if (fromStudentPayload) return fromStudentPayload;

    const byLibrary = shiftLabelLookup[student.library_id] || {};
    return byLibrary[membership.shift_id] || "";
  };

  const overviewStats = [
    {
      label: "Registered Libraries",
      value: stats?.totalLibraries ?? libraries.length,
      meta: `${coveredCities} cities`,
      icon: "apartment",
    },
    {
      label: "Active Libraries",
      value: stats?.activeLibraries ?? activeLibraries.length,
      meta: "System online",
      icon: "check_circle",
    },
    {
      label: "Total Students",
      value: (stats?.totalStudents ?? 0).toLocaleString("en-IN"),
      meta: "Platform users",
      icon: "groups",
    },
    {
      label: "Revenue",
      value: formatCurrency(stats?.revenue ?? 0),
      meta: "Platform payments",
      icon: "payments",
    },
  ];

  const renderActionButtons = (lib, compact = false) => (
    <div className={`admin-library-actions ${compact ? "compact" : ""}`}>
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setDrawerLib(lib)}
      >
        <span className="material-symbols-rounded icon-sm">visibility</span>
        View
      </button>

      {lib.status === "pending" && (
        <button
          className="btn btn-primary btn-sm"
          disabled={actionLoading === lib.id}
          onClick={() => handleApprove(lib)}
        >
          {actionLoading === lib.id ? (
            <>
              <span className="loading-spinner"></span>
              Processing
            </>
          ) : (
            <>
              <span className="material-symbols-rounded icon-sm">check_circle</span>
              Approve
            </>
          )}
        </button>
      )}

      {lib.status === "active" && (
        <>
          <button
            className="btn btn-danger btn-sm"
            disabled={actionLoading === lib.id}
            onClick={() => handleSuspend(lib)}
          >
            <span className="material-symbols-rounded icon-sm">block</span>
            Suspend
          </button>
          <button
            className="btn btn-navy btn-sm"
            disabled={actionLoading === lib.id}
            onClick={() => handleResetPassword(lib)}
          >
            <span className="material-symbols-rounded icon-sm">lock_reset</span>
            Reset
          </button>
        </>
      )}

      <button
        className="btn btn-danger-outline btn-sm"
        disabled={actionLoading === lib.id}
        onClick={() => handleDeleteClick(lib)}
        title="Delete library permanently"
      >
        <span className="material-symbols-rounded icon-sm">delete_forever</span>
        Delete
      </button>
    </div>
  );

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="container admin-topbar-inner">
          <div className="admin-topbar-brand">
            <div className="admin-topbar-logo">
              <span className="material-symbols-rounded">admin_panel_settings</span>
            </div>
            <div>
              <p className="admin-topbar-label">LibraryOS Control Center</p>
              <h1>Admin Dashboard</h1>
            </div>
          </div>

          <button
            id="admin-logout-btn"
            onClick={handleLogout}
            className="btn btn-secondary admin-logout-btn"
          >
            <span className="material-symbols-rounded icon-sm">logout</span>
            Logout
          </button>
        </div>
      </header>

      <main className="container admin-main">
        <section className="admin-hero">
          <div className="admin-hero-copy">
            <div className="admin-auth-badge admin-hero-badge">
              <span className="material-symbols-rounded icon-sm">dashboard</span>
              Operations overview
            </div>
            <h2>
              Manage all registered libraries, approvals, credentials, support,
              and site content from one responsive admin workspace.
            </h2>
            <p>
              The dashboard is wired to the current library data model:
              libraries, shifts, combined pricing, locker policies, support
              records, and site content tables.
            </p>
          </div>

          <div className="admin-hero-panels">
            <div className="admin-hero-panel">
              <span className="material-symbols-rounded">hourglass_empty</span>
              <strong>{pendingLibraries.length}</strong>
              <p>registrations waiting for approval</p>
            </div>
            <div className="admin-hero-panel">
              <span className="material-symbols-rounded">travel_explore</span>
              <strong>{coveredCities}</strong>
              <p>cities currently covered</p>
            </div>
          </div>
        </section>

        <div className="admin-tabs">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`admin-tab ${activeMainTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveMainTab(tab.id)}
            >
              <span className="material-symbols-rounded icon-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {activeMainTab === "libraries" && (
          <section className="admin-page-section">
            <div className="admin-overview-grid">
              {overviewStats.map((item) => (
                <article key={item.label} className="admin-metric-card">
                  <div className="admin-metric-icon">
                    <span className="material-symbols-rounded">{item.icon}</span>
                  </div>
                  <div>
                    <p>{item.label}</p>
                    <h3>{item.value}</h3>
                    <span>{item.meta}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="admin-split-layout">
              <div className="card admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <p className="admin-panel-kicker">Approval queue</p>
                    <h3>Pending registrations</h3>
                  </div>
                  <span className="badge badge-pending">
                    {pendingLibraries.length} pending
                  </span>
                </div>

                {pendingLibraries.length === 0 ? (
                  <p className="admin-empty-copy">
                    No libraries are waiting for approval right now.
                  </p>
                ) : (
                  <div className="admin-queue-list">
                    {pendingLibraries.slice(0, 4).map((lib) => (
                      <div key={lib.id} className="admin-queue-item">
                        <div>
                          <strong>{lib.name}</strong>
                          <p>
                            {lib.city}, {lib.state} • {lib.total_seats || 0} seats
                          </p>
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleApprove(lib)}
                          disabled={actionLoading === lib.id}
                        >
                          Approve
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card admin-panel-card">
                <div className="admin-panel-head">
                  <div>
                    <p className="admin-panel-kicker">Recent activity</p>
                    <h3>Latest registrations</h3>
                  </div>
                  <span className="badge badge-navy">
                    {recentLibraries.length} latest
                  </span>
                </div>

                <div className="admin-activity-list">
                  {recentLibraries.map((lib) => (
                    <div key={lib.id} className="admin-activity-item">
                      <div className="admin-activity-dot"></div>
                      <div>
                        <strong>{lib.name}</strong>
                        <p>
                          {formatDate(lib.created_at)} • {lib.city}, {lib.state}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card admin-panel-card admin-filter-card">
              <div className="admin-panel-head">
                <div>
                  <p className="admin-panel-kicker">Library directory</p>
                  <h3>Registered libraries</h3>
                </div>
                <span className="badge badge-active">
                  {filteredLibraries.length} visible
                </span>
              </div>

              <div className="admin-filter-pills">
                {QUICK_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    className={`admin-pill ${quickFilter === filter.id ? "active" : ""}`}
                    onClick={() => setQuickFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="admin-toolbar">
                <div className="admin-search">
                  <span className="material-symbols-rounded icon-sm">search</span>
                  <input
                    id="search-libraries"
                    type="text"
                    placeholder="Search by library, city, state, or login ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input"
                  />
                </div>
                <button className="btn btn-secondary" onClick={fetchLibraries}>
                  <span className="material-symbols-rounded icon-sm">refresh</span>
                  Refresh
                </button>
              </div>
            </div>

            {loading ? (
              <div className="card admin-loading-card">
                <span className="loading-spinner"></span>
                <p>Fetching registered libraries...</p>
              </div>
            ) : filteredLibraries.length === 0 ? (
              <div className="card admin-empty-card">
                <span className="material-symbols-rounded">search_off</span>
                <h3>No libraries found</h3>
                <p>
                  Try changing the search query or quick filter to see more
                  results.
                </p>
              </div>
            ) : (
              <>
                <div className="card p-0 overflow-hidden hidden-mobile">
                  <div className="table-container" style={{ border: "none" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Library</th>
                          <th>Location</th>
                          <th>Capacity</th>
                          <th>Students</th>
                          <th>Status</th>
                          <th>Login ID</th>
                          <th>Created</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLibraries.map((lib) => (
                          <tr key={lib.id}>
                            <td>
                              <div className="admin-table-library">
                                <strong>{lib.name}</strong>
                                <span>{lib.shifts?.length || 0} shifts configured</span>
                              </div>
                            </td>
                            <td>
                              {lib.city}, {lib.state}
                            </td>
                            <td>
                              {lib.total_seats || 0} seats
                              <br />
                              <span className="text-muted">
                                {lib.total_lockers || 0} lockers
                              </span>
                            </td>
                            <td>
                              <strong>{getStudentsCount(lib.id)}</strong>
                            </td>
                            <td>
                              <span className={`badge ${getStatusBadge(lib.status)}`}>
                                {lib.status}
                              </span>
                            </td>
                            <td>{lib.login_id || "—"}</td>
                            <td>{formatDate(lib.created_at)}</td>
                            <td style={{ textAlign: "right" }}>
                              {renderActionButtons(lib, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="admin-library-grid hidden-desktop">
                  {filteredLibraries.map((lib) => (
                    <article key={lib.id} className="admin-library-card">
                      <div className="admin-library-card-top">
                        <div>
                          <h3>{lib.name}</h3>
                          <p>
                            {lib.city}, {lib.state}
                          </p>
                        </div>
                        <span className={`badge ${getStatusBadge(lib.status)}`}>
                          {lib.status}
                        </span>
                      </div>

                      <div className="admin-library-meta">
                        <div>
                          <span>Seats</span>
                          <strong>{lib.total_seats || 0}</strong>
                        </div>
                        <div>
                          <span>Lockers</span>
                          <strong>{lib.total_lockers || 0}</strong>
                        </div>
                        <div>
                          <span>Shifts</span>
                          <strong>{lib.shifts?.length || 0}</strong>
                        </div>
                        <div>
                          <span>Created</span>
                          <strong>{formatDate(lib.created_at)}</strong>
                        </div>
                      </div>

                      {lib.login_id && (
                        <div className="admin-library-login">
                          Login ID: <code>{lib.login_id}</code>
                        </div>
                      )}

                      {renderActionButtons(lib)}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {activeMainTab === "content" && (
          <section className="admin-page-section">
            <div className="admin-embedded-panel">
              <AdminSiteContent />
            </div>
          </section>
        )}

        {activeMainTab === "students" && (
          <section className="admin-page-section">
            <div className="card p-0 overflow-hidden">
              <div className="table-container" style={{ border: "none" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Library</th>
                      <th>Phone</th>
                      <th>Gender</th>
                      <th>Seat</th>
                      <th>Shift</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>
                          No students found.
                        </td>
                      </tr>
                    ) : (
                      students.map((student) => {
                        const memberships = Array.isArray(student.memberships)
                          ? student.memberships
                          : [];
                        const membership = memberships[0] || {};
                        const shiftNames = Array.from(
                          new Set(
                            memberships
                              .map((m) => getShiftLabelForMembership(student, m))
                              .filter(Boolean),
                          ),
                        );
                        return (
                          <tr key={student.id}>
                            <td>
                              <strong>{student.full_name}</strong>
                              <br />
                              <span className="text-muted">{student.father_name}</span>
                            </td>
                            <td>{student.libraries?.name || "—"}</td>
                            <td>{student.phone}</td>
                            <td style={{ textTransform: "capitalize" }}>{student.gender}</td>
                            <td>
                              {membership.seat_number ? (
                                <span className="badge badge-navy">{membership.seat_number}</span>
                              ) : "—"}
                              {membership.locker_number && (
                                <><br/><span className="text-muted" style={{ fontSize: "0.8rem" }}>Locker: {membership.locker_number}</span></>
                              )}
                            </td>
                            <td>
                              {shiftNames.length > 0 ? shiftNames.join(" + ") : "—"}
                            </td>
                            <td>
                              <span className={`badge ${student.status === "active" ? "badge-active" : "badge-suspended"}`}>
                                {student.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeMainTab === "support" && (
          <section className="admin-page-section">
            <div className="admin-embedded-panel">
              <AdminSupportTab />
            </div>
          </section>
        )}
      </main>

      {drawerLib && (
        <>
          <div className="drawer-overlay" onClick={() => setDrawerLib(null)}></div>
          <aside className="drawer admin-drawer">
            <div className="admin-drawer-header">
              <div>
                <div className="admin-panel-kicker">Library details</div>
                <h2>{drawerLib.name}</h2>
                <p>
                  {drawerLib.city}, {drawerLib.state}
                </p>
              </div>
              <button className="btn-icon" onClick={() => setDrawerLib(null)}>
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="admin-drawer-body">
              <section className="admin-detail-block">
                <div className="admin-detail-hero">
                  <div>
                    <span className={`badge ${getStatusBadge(drawerLib.status)}`}>
                      {drawerLib.status}
                    </span>
                    <p className="admin-detail-copy">
                      Registered on {formatDate(drawerLib.created_at)}
                    </p>
                  </div>
                  {drawerLib.login_id && (
                    <code className="admin-inline-code">{drawerLib.login_id}</code>
                  )}
                </div>
              </section>

              <section className="admin-detail-block">
                <div className="admin-detail-title">Overview</div>
                <div className="admin-drawer-grid">
                  <div className="admin-detail-card">
                    <span>Address</span>
                    <strong>{drawerLib.address || "—"}</strong>
                  </div>
                  <div className="admin-detail-card">
                    <span>PIN Code</span>
                    <strong>{drawerLib.pincode || "—"}</strong>
                  </div>
                  <div className="admin-detail-card">
                    <span>Seats</span>
                    <strong>{drawerLib.total_seats || 0}</strong>
                  </div>
                  <div className="admin-detail-card">
                    <span>Lockers</span>
                    <strong>{drawerLib.total_lockers || 0}</strong>
                  </div>
                </div>
              </section>

              <section className="admin-detail-block">
                <div className="admin-detail-title">Contact</div>
                <div className="admin-drawer-grid">
                  <div className="admin-detail-card">
                    <span>Phone</span>
                    <strong>{drawerLib.contact_phone || "—"}</strong>
                  </div>
                  <div className="admin-detail-card">
                    <span>Email</span>
                    <strong className="admin-break-text">
                      {drawerLib.contact_email || "—"}
                    </strong>
                  </div>
                </div>
              </section>

              {drawerLib.shifts?.length > 0 && (
                <section className="admin-detail-block">
                  <div className="admin-detail-title">Shift pricing</div>
                  <div className="admin-detail-list">
                    {drawerLib.shifts.map((shift) => (
                      <div key={shift.id} className="admin-detail-row">
                        <div>
                          <strong>{shift.label}</strong>
                          <p>
                            {shift.start_time} - {shift.end_time}
                          </p>
                        </div>
                        <span>{formatCurrency(shift.monthly_fee)}/mo</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {drawerLib.combined_shift_pricing?.length > 0 && (
                <section className="admin-detail-block">
                  <div className="admin-detail-title">Combined plans</div>
                  <div className="admin-detail-list">
                    {drawerLib.combined_shift_pricing.map((item) => (
                      <div key={item.id} className="admin-detail-row">
                        <div>
                          <strong>{item.label}</strong>
                          <p>Combined shift package</p>
                        </div>
                        <span>{formatCurrency(item.combined_fee)}/mo</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {drawerLib.locker_policies?.length > 0 &&
                Number(drawerLib.total_lockers || 0) > 0 && (
                  <section className="admin-detail-block">
                    <div className="admin-detail-title">Locker policies</div>
                    <div className="admin-detail-list">
                      {drawerLib.locker_policies.map((policy) => (
                        <div key={policy.id} className="admin-detail-row stacked">
                          <div>
                            <strong>
                              {policy.eligible_shift_type === "any"
                                ? "Any member"
                                : policy.eligible_shift_type === "12h_plus"
                                  ? "Full day members"
                                  : "24 hour members"}
                            </strong>
                            <p>{policy.description || "No extra rules added."}</p>
                          </div>
                          <span>{formatCurrency(policy.monthly_fee)}/mo</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
            </div>

            <div className="admin-drawer-footer">
              {drawerLib.status === "pending" && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    handleApprove(drawerLib);
                    setDrawerLib(null);
                  }}
                >
                  <span className="material-symbols-rounded icon-sm">check_circle</span>
                  Approve registration
                </button>
              )}

              {drawerLib.status === "active" && (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      handleSuspend(drawerLib);
                      setDrawerLib(null);
                    }}
                  >
                    <span className="material-symbols-rounded icon-sm">block</span>
                    Suspend
                  </button>
                  <button
                    className="btn btn-navy"
                    onClick={() => {
                      handleResetPassword(drawerLib);
                      setDrawerLib(null);
                    }}
                  >
                    <span className="material-symbols-rounded icon-sm">lock_reset</span>
                    Reset credentials
                  </button>
                </>
              )}

              <button
                className="btn btn-danger-outline"
                onClick={() => handleDeleteClick(drawerLib)}
              >
                <span className="material-symbols-rounded icon-sm">delete_forever</span>
                Delete permanently
              </button>
            </div>
          </aside>
        </>
      )}

      {credModal && (
        <div className="modal-overlay">
          <div className="modal-content admin-credential-modal">
            <div className="admin-credential-icon">
              <span className="material-symbols-rounded">key</span>
            </div>
            <h3>Credentials ready</h3>
            <p>
              Save these credentials for <strong>{credModal.libraryName}</strong>.
            </p>

            <div className="admin-credential-box">
              <div>
                <span>Login ID</span>
                <code>{credModal.login_id}</code>
              </div>
              <div>
                <span>Password</span>
                <code>{credModal.password}</code>
              </div>
            </div>

            <div className="admin-credential-note">
              These credentials are shown once. Copy them before closing this
              modal.
            </div>

            <div className="admin-credential-actions">
              <button className="btn btn-primary" onClick={copyCredentials}>
                <span className="material-symbols-rounded icon-sm">content_copy</span>
                Copy credentials
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setCredModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ color: "var(--color-danger)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="material-symbols-rounded">warning</span>
              Permanently Delete Library
            </h3>
            <p style={{ marginBottom: "1rem", color: "var(--color-text-main)", lineHeight: "1.5" }}>
              Are you absolutely sure you want to delete <strong>{deleteModal.name}</strong>?
              <br /><br />
              This will remove ALL data including students, seats, lockers, shifts, and memberships. This action <strong style={{color: "var(--color-danger)"}}>CANNOT be undone.</strong>
            </p>
            
            <div className="form-group" style={{ marginBottom: "1.5rem" }}>
              <label className="form-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                Type <strong style={{userSelect: "none"}}>{deleteModal.name}</strong> to confirm:
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={deleteModal.name}
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteModal(null)}
                disabled={actionLoading === deleteModal.id}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleteInput !== deleteModal.name || actionLoading === deleteModal.id}
                style={{ 
                  opacity: deleteInput !== deleteModal.name ? 0.5 : 1, 
                  cursor: deleteInput !== deleteModal.name ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease"
                }}
              >
                {actionLoading === deleteModal.id ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
