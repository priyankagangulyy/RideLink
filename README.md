# RideLink

RideLink is a student ridesharing app for posting trips, finding open seats, and keeping joined and offered rides in one place.

## Features

- University email sign-up with a short-lived email verification code
- Password hashing with bcrypt, session cookies, login rate limits, and server-side input validation
- Create, search, join, leave, and cancel rides
- Private ride listings available only to signed-in, email-verified users
- One-click map directions for each posted route
- Atomic seat updates so concurrent join requests cannot overbook a ride
- Ride-related community reports stored in MongoDB with an administrator review queue
- Helmet security headers, same-site HTTP-only session cookies, and origin checks for state-changing requests

University email verification confirms control of an address at a `.edu` domain. It does not prove current enrollment at a university.

## Run locally

Requirements: Node.js 20+, MongoDB, and an SMTP account for sending verification codes. For a local-only demo, the API can reveal verification codes when `ALLOW_DEV_EMAIL_CODE=true`; never enable that option in production.

1. Copy `server/.env.example` to `server/.env` if you do not already have a local config. Set `MONGODB_URI`, a long random `SESSION_SECRET`, and `ADMIN_EMAILS` to one or more verified university email addresses that should be allowed to review reports.
2. In Atlas, add the current public IP address of the machine running the API under **Network Access**. Keep the allowlist narrow; do not allow all IP addresses.
3. For real verification email, set the SMTP values in `server/.env`. In local development only, set `ALLOW_DEV_EMAIL_CODE=true` to display the code in the server response and terminal.
4. In one terminal, run `cd server && npm install && npm run dev`.
5. In another terminal, run `cd client && npm install && npm run dev`.
6. Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

Vite forwards `/api` requests to the local API at port 4000. Set `CLIENT_URL` to the exact frontend origin. Use HTTPS, a unique secret, real email delivery, and secure environment variables for deployment. Do not use the development email-code mode in production.

## Project structure

- `client/` — React and Vite interface
- `server/` — Express API, MongoDB models, authentication, ride and report routes

## Security notes

Passwords are hashed with bcrypt and are never returned by the API. Sessions are stored in MongoDB; the browser cookie is HTTP-only and uses `SameSite=Lax`. Authentication routes have rate limits. Ride search input is treated as plain text, and join operations validate availability in the same atomic database update that changes the seat count.

This project is a portfolio MVP. It does not provide university enrollment checks, password recovery, or two-factor authentication. A `.edu` address plus a verification code confirms control of that email address; it does not prove current enrollment. Admin access is limited to verified addresses listed in `ADMIN_EMAILS`.
