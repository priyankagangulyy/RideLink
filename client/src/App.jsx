import './App.css';

function App() {
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
          <button className="sign-in">Sign in</button>
          <button className="nav-cta">Join RideLink <span>↗</span></button>
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

            <div className="search-panel" id="find-rides">
              <label className="search-field">
                <span>FROM</span>
                <input type="text" placeholder="Your starting point" />
              </label>

              <div className="field-divider" aria-hidden="true" />

              <label className="search-field">
                <span>TO</span>
                <input type="text" placeholder="Where are you going?" />
              </label>

              <div className="field-divider" aria-hidden="true" />

              <label className="search-field date-field">
                <span>WHEN</span>
                <input type="date" aria-label="Travel date" />
              </label>

              <button className="search-button" type="button">
                Find rides <span>→</span>
              </button>
            </div>

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
