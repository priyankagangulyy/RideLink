import { useState } from "react";
import "./App.css";

function dateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizePlace(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const sampleRides = [
  {
    origin: "Santa Clara University",
    destination: "San José",
    date: dateAfter(0),
    time: "5:30 PM",
    seats: 3,
    driver: "Jordan",
  },
  {
    origin: "Santa Clara University",
    destination: "San José Downtown",
    date: dateAfter(1),
    time: "6:15 PM",
    seats: 2,
    driver: "Maya",
  },
];

function App() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  function handleSearch(event) {
    event.preventDefault();

    if (!from.trim() || !to.trim()) {
      setError("Enter both a starting point and a destination.");
      setResults(null);
      return;
    }

    const normalizedFrom = normalizePlace(from);
    const normalizedTo = normalizePlace(to);

    const matches = sampleRides.filter((ride) => {
      const matchesFrom = normalizePlace(ride.origin).includes(normalizedFrom);
      const matchesTo = normalizePlace(ride.destination).includes(normalizedTo);
      const matchesDate = !date || ride.date === date;

      return matchesFrom && matchesTo && matchesDate;
    });

    setError("");
    setResults(matches);
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="RideLink home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>RideLink</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a href="#find-rides">Find a ride</a>
          <a href="#how-it-works">How it works</a>
          <a href="#community">Our community</a>
        </nav>

        <div className="nav-actions">
          <button className="sign-in" type="button">Sign in</button>
          <button className="nav-cta" type="button">
            Join RideLink <span>↗</span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              CAMPUS RIDES, WITH A BETTER ROUTE
            </div>

            <h1>
              Good trips
              <br />
              <span>start together.</span>
            </h1>

            <p className="hero-description">
              Find a seat, share the drive, and make getting there part of the
              experience.
            </p>

            <form className="search-panel" id="find-rides" onSubmit={handleSearch}>
              <label className="search-field">
                <span>FROM</span>
                <input
                  type="text"
                  list="place-suggestions"
                  placeholder="Your starting point"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </label>

              <div className="field-divider" aria-hidden="true" />

              <label className="search-field">
                <span>TO</span>
                <input
                  type="text"
                  list="place-suggestions"
                  placeholder="Where are you going?"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </label>

              <div className="field-divider" aria-hidden="true" />

              <label className="search-field date-field">
                <span>WHEN</span>
                <input
                  type="date"
                  aria-label="Travel date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              <button className="search-button" type="submit">
                Find rides <span>→</span>
              </button>

              <datalist id="place-suggestions">
                <option value="Santa Clara University" />
                <option value="Santa Clara" />
                <option value="San José" />
                <option value="San Jose Downtown" />
              </datalist>
            </form>

            {error && <p className="search-message search-error">{error}</p>}

            {results !== null && (
              <section className="search-results" aria-live="polite">
                <h2>
                  {results.length
                    ? `${results.length} sample ride${results.length === 1 ? "" : "s"} found`
                    : "No sample rides found"}
                </h2>

                {results.length === 0 ? (
                  <p className="search-message">
                    Try “Santa Clara” for your starting point and “San Jose”
                    for your destination.
                  </p>
                ) : (
                  results.map((ride) => (
                    <article
                      className="search-result-card"
                      key={`${ride.driver}-${ride.date}`}
                    >
                      <div>
                        <span className="trip-label">DEMO RIDE · {ride.time}</span>
                        <h3>{ride.origin} → {ride.destination}</h3>
                        <p>
                          {new Date(`${ride.date}T12:00:00`).toLocaleDateString()}
                          {" · "}Driver: {ride.driver}
                        </p>
                      </div>
                      <span className="result-seats">{ride.seats} seats open</span>
                    </article>
                  ))
                )}
              </section>
            )}

            <p className="hero-note">
              <span className="note-icon">✳</span>
              Built for student schedules and shared journeys.
            </p>
          </div>

          <div className="hero-visual" aria-label="Illustration of a shared trip">
            <div className="visual-topline">
              <span>THE WAY THERE</span>
              <span className="live-dot">● LIVE ROUTE</span>
            </div>

            <div className="route-canvas">
              <div className="map-grid" />
              <svg
                className="route-svg"
                viewBox="0 0 500 320"
                role="img"
                aria-label="A route connecting campus to downtown"
              >
                <path
                  className="route-shadow"
                  d="M92 240 C142 215 130 140 210 160 S298 240 365 188 S390 108 430 85"
                />
                <path
                  className="route-path"
                  d="M92 240 C142 215 130 140 210 160 S298 240 365 188 S390 108 430 85"
                />
              </svg>

              <div className="map-pin start-pin"><span>A</span></div>
              <div className="map-pin end-pin"><span>B</span></div>
              <div className="map-label start-label">CAMPUS</div>
              <div className="map-label end-label">DOWNTOWN</div>

              <div className="route-chip">
                <span className="route-chip-dot" />
                28 min · 3 seats open
              </div>
            </div>

            <div className="trip-card">
              <div className="trip-card-top">
                <div>
                  <span className="trip-label">SAMPLE RIDE</span>
                  <h2>Santa Clara → San José</h2>
                </div>
                <span className="trip-arrow">↗</span>
              </div>

              <div className="trip-card-bottom">
                <div className="rider-stack" aria-label="Three riders">
                  <span>J</span>
                  <span>M</span>
                  <span>A</span>
                </div>
                <span>Good company, one shared route.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="value-section" id="how-it-works">
          <div className="section-heading">
            <span>MADE FOR THE IN-BETWEEN</span>
            <h2>Less coordinating.<br />More getting there.</h2>
          </div>

          <div className="value-cards" id="community">
            <article className="value-card">
              <span className="card-number">01</span>
              <h3>Find your people</h3>
              <p>Browse rides that fit your destination and schedule.</p>
            </article>

            <article className="value-card">
              <span className="card-number">02</span>
              <h3>Share the journey</h3>
              <p>See the ride details and open seats before you join.</p>
            </article>

            <article className="value-card">
              <span className="card-number">03</span>
              <h3>Keep plans clear</h3>
              <p>Your posted and joined rides live together in one place.</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;