import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import MapsLocationPicker from "./MapsLocationPicker.jsx";

function localDateValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function parseTimeInput(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toLowerCase();
  if (minutes > 59) return null;
  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === "p" && hours !== 12) hours += 12;
    if (period === "a" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDistance(meters) {
  if (!Number.isFinite(Number(meters))) return "";
  const miles = Number(meters) / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function formatDeparture(value) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RideCard({ ride, user, onAction, onReport, busy }) {
  const driverId = ride.driver?._id || ride.driver?.id;
  const isDriver = user && driverId === user.id;
  const isPassenger = user && ride.passengers?.some((person) => (person._id || person.id) === user.id);
  const origin = Number.isFinite(ride.originCoordinates?.lat) && Number.isFinite(ride.originCoordinates?.lng)
    ? `${ride.originCoordinates.lat},${ride.originCoordinates.lng}`
    : ride.origin;
  const destination = Number.isFinite(ride.destinationCoordinates?.lat) && Number.isFinite(ride.destinationCoordinates?.lng)
    ? `${ride.destinationCoordinates.lat},${ride.destinationCoordinates.lng}`
    : ride.destination;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;

  return (
    <article className="ride-card">
      <div className="ride-card-route">
        <span className="route-marker" aria-hidden="true"><i /><i /></span>
        <div>
          <h3>{ride.origin} <span aria-hidden="true">→</span> {ride.destination}</h3>
          <p>{formatDeparture(ride.departureAt)}</p>
          {ride.distanceMeters && <p className="ride-distance">{formatDistance(ride.distanceMeters)} driving distance</p>}
          {ride.notes && <p className="ride-notes">{ride.notes}</p>}
        </div>
      </div>
      <div className="ride-card-meta">
        <div className="driver-label">
          <span className="avatar">{ride.driver?.name?.slice(0, 1)?.toUpperCase() || "R"}</span>
          <span>Ride by <strong>{ride.driver?.name || "Student"}</strong></span>
        </div>
        <span className="seat-pill">{ride.seatsAvailable} {ride.seatsAvailable === 1 ? "seat" : "seats"} open</span>
      </div>
      <div className="ride-card-actions">
        {isDriver ? (
          <button className="button button-quiet" disabled={busy} onClick={() => onAction(ride, "cancel")}>Cancel ride</button>
        ) : isPassenger ? (
          <button className="button button-quiet" disabled={busy} onClick={() => onAction(ride, "leave")}>Leave ride</button>
        ) : (
          <button className="button button-primary" disabled={busy || ride.seatsAvailable < 1} onClick={() => onAction(ride, "join")}>
            {busy ? "Please wait…" : "Request a seat"}
          </button>
        )}
        {user && !isDriver && onReport && (
          <button className="text-button" disabled={busy} onClick={() => onReport(ride)}>Report</button>
        )}
        <a className="text-button map-route-link" href={directionsUrl} target="_blank" rel="noreferrer">View route ↗</a>
      </div>
    </article>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [rides, setRides] = useState([]);
  const [myRides, setMyRides] = useState([]);
  const [reports, setReports] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [activeTab, setActiveTab] = useState("find");
  const [authMode, setAuthMode] = useState("signin");
  const [authOpen, setAuthOpen] = useState(false);
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", confirmPassword: "", code: "" });
  const [verifyEmail, setVerifyEmail] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [busyRide, setBusyRide] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rideForm, setRideForm] = useState({
    origin: "",
    destination: "",
    originCoordinates: null,
    destinationCoordinates: null,
    distanceMeters: null,
    departureDate: "",
    departureTime: "",
    seats: "2",
    notes: "",
  });
  const [minimumDepartureDate] = useState(() => localDateValue(new Date()));
  const [rideFormOpen, setRideFormOpen] = useState(false);
  const [reportRide, setReportRide] = useState(null);
  const [reportForm, setReportForm] = useState({ reason: "safety", details: "" });
  const [toast, setToast] = useState("");

  const fetchRides = useCallback(async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.date) params.set("date", filters.date);
    try {
      const data = await api(`/rides${params.size ? `?${params}` : ""}`);
      setRides(data.rides || []);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const fetchMyRides = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api("/my-rides");
      setMyRides(data.rides || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [user]);

  const fetchReports = useCallback(async () => {
    if (!user?.isAdmin) return;
    try {
      const data = await api("/admin/reports");
      setReports(data.reports || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [user]);

  useEffect(() => {
    let active = true;
    api("/auth/me").then(async (data) => {
      if (!active) return;
      setUser(data.user);
      if (data.user) {
        try {
          const rideData = await api("/rides");
          if (active) setRides(rideData.rides || []);
        } catch (requestError) {
          if (active) setError(requestError.message);
        }
      }
    }).catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api("/my-rides").then((data) => { if (active) setMyRides(data.rides || []); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!user?.isAdmin) return undefined;
    let active = true;
    api("/admin/reports").then((data) => { if (active) setReports(data.reports || []); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleRides = activeTab === "mine" ? myRides : rides;
  const sectionTitle = useMemo(() => activeTab === "mine" ? "Your rides" : activeTab === "admin" ? "Community reports" : "Rides going your way", [activeTab]);

  function openAuth(mode = "signin") {
    setAuthMode(mode);
    setAuthError("");
    setAuthNotice("");
    setAuthOpen(true);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      if (authMode === "signup") {
        if (authForm.password !== authForm.confirmPassword) throw new Error("Your passwords do not match.");
        const data = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name: authForm.name, email: authForm.email, password: authForm.password }),
        });
        setVerifyEmail(data.email);
        setAuthForm((form) => ({ ...form, code: data.developmentCode || "" }));
        setAuthMode("verify");
        setAuthNotice(data.developmentCode ? `Local demo code: ${data.developmentCode}` : data.message);
      } else if (authMode === "verify") {
        const data = await api("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ email: verifyEmail, code: authForm.code }),
        });
        setUser(data.user);
        setAuthOpen(false);
        setAuthNotice("");
        setToast("University email verified. Welcome to RideLink!");
        await Promise.all([fetchRides(), fetchMyRides()]);
      } else {
        const data = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: authForm.email, password: authForm.password }),
        });
        setUser(data.user);
        setAuthOpen(false);
        setToast(`Welcome back, ${data.user.name.split(" ")[0]}.`);
        await Promise.all([fetchRides(), fetchMyRides()]);
      }
    } catch (requestError) {
      setAuthError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setMyRides([]);
    setReports([]);
    setActiveTab("find");
    setToast("You’re signed out.");
  }

  async function handleSearch(event) {
    event.preventDefault();
    if (!user) {
      openAuth("signin");
      return;
    }
    setActiveTab("find");
    await fetchRides({ from: from.trim(), to: to.trim(), date });
    document.getElementById("rides")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleRideAction(ride, action) {
    if (!user) return openAuth("signin");
    setBusyRide(ride._id);
    try {
      if (action === "join") await api(`/rides/${ride._id}/join`, { method: "POST" });
      if (action === "leave") await api(`/rides/${ride._id}/join`, { method: "DELETE" });
      if (action === "cancel") await api(`/rides/${ride._id}`, { method: "DELETE" });
      setToast(action === "join" ? "Seat requested. You’re on the ride list." : action === "leave" ? "You left the ride." : "Ride cancelled.");
      await Promise.all([fetchRides({ from, to, date }), fetchMyRides()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyRide("");
    }
  }

  async function handleCreateRide(event) {
    event.preventDefault();
    const normalizedTime = parseTimeInput(rideForm.departureTime);
    if (!rideForm.originCoordinates || !rideForm.destinationCoordinates) {
      setError("Choose both addresses from the Google Maps suggestions or place both pins on the map.");
      return;
    }
    if (!rideForm.distanceMeters) {
      setError("Wait for Google Maps to calculate the driving route before posting.");
      return;
    }
    if (!rideForm.departureDate || !normalizedTime) {
      setError("Enter a valid departure date and time, such as 9:30 AM or 14:30.");
      return;
    }
    try {
      const localDeparture = new Date(`${rideForm.departureDate}T${normalizedTime}:00`);
      if (!Number.isFinite(localDeparture.getTime()) || localDeparture <= new Date()) {
        throw new Error("Choose a departure time in the future.");
      }
      const departureAt = localDeparture.toISOString();
      await api("/rides", {
        method: "POST",
        body: JSON.stringify({
          origin: rideForm.origin,
          destination: rideForm.destination,
          originCoordinates: rideForm.originCoordinates,
          destinationCoordinates: rideForm.destinationCoordinates,
          distanceMeters: rideForm.distanceMeters,
          departureAt,
          seats: Number(rideForm.seats),
          notes: rideForm.notes,
        }),
      });
      setRideFormOpen(false);
      setRideForm({ origin: "", destination: "", originCoordinates: null, destinationCoordinates: null, distanceMeters: null, departureDate: "", departureTime: "", seats: "2", notes: "" });
      setToast("Your ride is posted.");
      setActiveTab("find");
      await Promise.all([fetchRides({ from, to, date }), fetchMyRides()]);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleReport(event) {
    event.preventDefault();
    try {
      await api("/reports", {
        method: "POST",
        body: JSON.stringify({
          reportedUserId: reportRide.driver._id,
          rideId: reportRide._id,
          ...reportForm,
        }),
      });
      setReportRide(null);
      setReportForm({ reason: "safety", details: "" });
      setToast("Your report was submitted.");
      await fetchReports();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function updateReportStatus(report, status) {
    try {
      await api(`/admin/reports/${report._id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await fetchReports();
      setToast("Report status updated.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function requireSignIn(action) {
    if (!user) return openAuth("signup");
    action();
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RideLink home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>RideLink</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#find-rides" onClick={() => setActiveTab("find")}>Find a ride</a>
          <a href="#how-it-works">How it works</a>
          {user && <button className="nav-link-button" onClick={() => { setActiveTab("mine"); document.getElementById("rides")?.scrollIntoView({ behavior: "smooth" }); }}>Your rides</button>}
          {user?.isAdmin && <button className="nav-link-button" onClick={() => { setActiveTab("admin"); document.getElementById("rides")?.scrollIntoView({ behavior: "smooth" }); }}>Safety reports</button>}
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              <span className="verified-user"><span>✓</span> {user.name.split(" ")[0]}</span>
              <button className="sign-in" type="button" onClick={handleLogout}>Sign out</button>
            </>
          ) : (
            <>
              <button className="sign-in" type="button" onClick={() => openAuth("signin")}>Sign in</button>
              <button className="nav-cta" type="button" onClick={() => openAuth("signup")}>Join RideLink <span>↗</span></button>
            </>
          )}
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> CAMPUS RIDES, WITH A BETTER ROUTE</div>
            <h1>Good trips<br /><span>start together.</span></h1>
            <p className="hero-description">Find a seat, share the drive, and make getting there part of the experience.</p>
            <form className="search-panel" id="find-rides" onSubmit={handleSearch}>
              <label className="search-field"><span>FROM</span><input type="text" placeholder="Starting point" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <div className="field-divider" aria-hidden="true" />
              <label className="search-field"><span>TO</span><input type="text" placeholder="Where are you going?" value={to} onChange={(event) => setTo(event.target.value)} /></label>
              <div className="field-divider" aria-hidden="true" />
              <label className="search-field date-field"><span>WHEN</span><input type="date" aria-label="Travel date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <button className="search-button" type="submit">Find rides <span>→</span></button>
            </form>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="hero-actions">
              <button className="hero-post-button" type="button" onClick={() => requireSignIn(() => setRideFormOpen(true))}>Offer a ride <span>↗</span></button>
              <p className="hero-note"><span className="note-icon">✳</span> University email required to join.</p>
            </div>
          </div>

          <div className="hero-visual" aria-label="Illustration of a shared trip">
            <div className="visual-topline"><span>THE WAY THERE</span><span className="live-dot">● STUDENT COMMUNITY</span></div>
            <div className="route-canvas">
              <div className="map-grid" />
              <svg className="route-svg" viewBox="0 0 500 320" role="img" aria-label="A route connecting campus to downtown">
                <path className="route-shadow" d="M92 240 C142 215 130 140 210 160 S298 240 365 188 S390 108 430 85" />
                <path className="route-path" d="M92 240 C142 215 130 140 210 160 S298 240 365 188 S390 108 430 85" />
              </svg>
              <div className="map-pin start-pin"><span>A</span></div><div className="map-pin end-pin"><span>B</span></div>
              <div className="map-label start-label">CAMPUS</div><div className="map-label end-label">DOWNTOWN</div>
              <div className="route-chip"><span className="route-chip-dot" /> Shared ride · verified students</div>
            </div>
            <div className="trip-card">
              <div className="trip-card-top"><div><span className="trip-label">RIDE TOGETHER</span><h2>One route. More room.</h2></div><span className="trip-arrow">↗</span></div>
              <div className="trip-card-bottom"><span className="verified-badge">✓ .edu verified</span><span>Clear plans, campus community.</span></div>
            </div>
          </div>
        </section>

        <section className="rides-section" id="rides">
          <div className="rides-heading">
            <div><span className="section-kicker">MAKE THE NEXT TRIP EASIER</span><h2>{sectionTitle}</h2></div>
            {activeTab !== "admin" && <div className="ride-tabs" role="tablist" aria-label="Ride lists">
              <button className={activeTab === "find" ? "active" : ""} role="tab" aria-selected={activeTab === "find"} onClick={() => setActiveTab("find")}>Find rides</button>
              <button className={activeTab === "mine" ? "active" : ""} role="tab" aria-selected={activeTab === "mine"} onClick={() => user ? setActiveTab("mine") : openAuth("signin")}>Your rides</button>
            </div>}
          </div>
          {activeTab === "admin" ? (
            reports.length ? <div className="report-list">{reports.map((report) => <article className="report-card" key={report._id}>
              <div className="report-card-heading"><span className={`report-status status-${report.status}`}>{report.status}</span><span>{formatDeparture(report.createdAt)}</span></div>
              <h3>{report.reason === "safety" ? "Safety concern" : report.reason === "conduct" ? "Inappropriate conduct" : report.reason === "fraud" ? "False or misleading ride" : "Other report"}</h3>
              <p><strong>Ride:</strong> {report.ride ? `${report.ride.origin} → ${report.ride.destination}` : "Ride unavailable"}</p>
              <p><strong>Reported:</strong> {report.reportedUser?.name} · {report.reportedUser?.email}</p>
              <p><strong>Submitted by:</strong> {report.reporter?.name} · {report.reporter?.email}</p>
              {report.details && <blockquote>{report.details}</blockquote>}
              <label className="report-status-control">Update status<select value={report.status} onChange={(event) => updateReportStatus(report, event.target.value)}><option value="open">Open</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option></select></label>
            </article>)}</div> : <div className="empty-rides"><span className="empty-icon">✓</span><h3>No reports yet</h3><p>Ride-related community safety reports will appear here.</p></div>
          ) : visibleRides.length ? (
            <div className="ride-list">
              {visibleRides.map((ride) => <RideCard key={ride._id} ride={ride} user={user} busy={busyRide === ride._id} onAction={handleRideAction} onReport={activeTab === "find" ? setReportRide : null} />)}
            </div>
          ) : (
            <div className="empty-rides"><span className="empty-icon">↗</span><h3>{activeTab === "mine" ? "Your next trip starts here" : user ? "No rides match yet" : "Sign in to see student rides"}</h3><p>{activeTab === "mine" ? "Find an open seat or offer a ride to your campus community." : user ? "Try a different route or date, or be the first to post this trip." : "Ride details are visible only to accounts with a verified university email."}</p><button className="button button-primary" onClick={() => activeTab === "mine" ? setActiveTab("find") : !user ? openAuth("signin") : setRideFormOpen(true)}>{activeTab === "mine" ? "Find a ride" : user ? "Offer a ride" : "Sign in to find rides"}</button></div>
          )}
          {activeTab === "find" && user && <button className="refresh-rides" onClick={() => fetchRides({ from, to, date })}>Refresh rides</button>}
        </section>

        <section className="value-section" id="how-it-works">
          <div className="section-heading"><span>MADE FOR THE IN-BETWEEN</span><h2>Less coordinating.<br />More getting there.</h2><p>RideLink gives students a simple way to share campus trips and stay in control of their plans.</p></div>
          <div className="value-cards">
            <article className="value-card"><span className="card-number">01</span><h3>University email check</h3><p>Only accounts with a verified university email can sign in and use rides.</p></article>
            <article className="value-card"><span className="card-number">02</span><h3>Seat counts stay current</h3><p>Ride seats update when a student joins or leaves, including when requests happen at the same time.</p></article>
            <article className="value-card"><span className="card-number">03</span><h3>Report a concern</h3><p>Send a ride-related report for review from the ride listing.</p></article>
          </div>
        </section>
      </main>

      {authOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="modal-close" aria-label="Close" onClick={() => setAuthOpen(false)}>×</button>
          <span className="modal-kicker">RIDE TOGETHER, STUDENT TO STUDENT</span>
          <h2 id="auth-title">{authMode === "verify" ? "Check your inbox" : authMode === "signup" ? "Join RideLink" : "Welcome back"}</h2>
          <p className="modal-description">{authMode === "verify" ? `Enter the 6-digit code sent to ${verifyEmail}.` : "Use your university .edu email to get started."}</p>
          <form className="modal-form" onSubmit={handleAuthSubmit}>
            {authMode === "signup" && <label>Your name<input required maxLength="80" autoComplete="name" value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} /></label>}
            {authMode !== "verify" && <label>University email<input type="email" required autoComplete="email" placeholder="you@university.edu" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>}
            {authMode === "verify" && <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="000000" value={authForm.code} onChange={(event) => setAuthForm({ ...authForm, code: event.target.value.replace(/\D/g, "").slice(0, 6) })} /></label>}
            {authMode !== "verify" && <label>Password<input type="password" required autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength="12" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /><small>Use at least 12 characters.</small></label>}
            {authMode === "signup" && <label>Confirm password<input type="password" required autoComplete="new-password" minLength="12" value={authForm.confirmPassword} onChange={(event) => setAuthForm({ ...authForm, confirmPassword: event.target.value })} /></label>}
            {authError && <p className="form-error" role="alert">{authError}</p>}
            {authNotice && <p className="form-notice" role="status">{authNotice}</p>}
            <button className="button button-primary modal-submit" disabled={loading}>{loading ? "Please wait…" : authMode === "verify" ? "Verify email" : authMode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          {authMode === "verify" ? <button className="modal-switch" onClick={() => { setAuthMode("signup"); setAuthNotice(""); setAuthError(""); }}>Use a different email</button> : <p className="modal-switch">{authMode === "signup" ? "Already have an account?" : "New to RideLink?"} <button onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); setAuthNotice(""); }}> {authMode === "signup" ? "Sign in" : "Create an account"}</button></p>}
          <p className="privacy-note">Passwords are protected with a one-way hash. Your password is never stored as readable text.</p>
        </section>
      </div>}

      {rideFormOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRideFormOpen(false)}>
        <section className="modal-card ride-modal" role="dialog" aria-modal="true" aria-labelledby="ride-title">
          <button className="modal-close" aria-label="Close" onClick={() => setRideFormOpen(false)}>×</button>
          <span className="modal-kicker">OFFER A SEAT</span><h2 id="ride-title">Post a ride</h2><p className="modal-description">Share the route and leave the rest to RideLink.</p>
          <form className="modal-form" onSubmit={handleCreateRide}>
            <MapsLocationPicker
              apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
              origin={rideForm.origin}
              destination={rideForm.destination}
              originCoordinates={rideForm.originCoordinates}
              destinationCoordinates={rideForm.destinationCoordinates}
              onLocationChange={(field, address, coordinates) => setRideForm((form) => ({
                ...form,
                [field]: address,
                [`${field}Coordinates`]: coordinates,
                distanceMeters: null,
              }))}
              onDistanceChange={(route) => setRideForm((form) => ({ ...form, distanceMeters: route?.meters || null }))}
            />
            <label>Departure date<input type="date" required min={minimumDepartureDate} value={rideForm.departureDate} onChange={(event) => setRideForm({ ...rideForm, departureDate: event.target.value })} /></label>
            <label>Departure time<input type="text" required maxLength="10" inputMode="text" autoComplete="off" placeholder="9:30 AM or 14:30" value={rideForm.departureTime} onChange={(event) => setRideForm({ ...rideForm, departureTime: event.target.value })} /><small>Type the time directly. We’ll check that it’s valid and in the future.</small></label>
            <label>Open seats<select value={rideForm.seats} onChange={(event) => setRideForm({ ...rideForm, seats: event.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
            <label>Details (optional)<textarea maxLength="500" rows="3" placeholder="Pickup details or anything riders should know" value={rideForm.notes} onChange={(event) => setRideForm({ ...rideForm, notes: event.target.value })} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary modal-submit">Post ride</button>
          </form>
        </section>
      </div>}

      {reportRide && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReportRide(null)}>
        <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <button className="modal-close" aria-label="Close" onClick={() => setReportRide(null)}>×</button>
          <span className="modal-kicker">COMMUNITY SAFETY</span><h2 id="report-title">Report a concern</h2><p className="modal-description">Report the driver of this ride. Include details that will help a reviewer understand what happened.</p>
          <form className="modal-form" onSubmit={handleReport}>
            <label>Reason<select value={reportForm.reason} onChange={(event) => setReportForm({ ...reportForm, reason: event.target.value })}><option value="safety">Safety concern</option><option value="conduct">Inappropriate conduct</option><option value="fraud">False or misleading ride</option><option value="other">Other</option></select></label>
            <label>Details<textarea rows="4" maxLength="1000" value={reportForm.details} onChange={(event) => setReportForm({ ...reportForm, details: event.target.value })} placeholder="What happened?" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary modal-submit">Send report</button>
          </form>
        </section>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <footer className="site-footer"><span>RideLink</span><span>Built for students sharing the way.</span><span className="footer-trust">Verified email · Secure sessions · Community reporting</span></footer>
    </div>
  );
}

export default App;
