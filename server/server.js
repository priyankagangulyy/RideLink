require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

if (isProduction) app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "20kb" }));

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true, select: false },
      emailVerified: { type: Boolean, default: false },
      verificationCodeHash: { type: String, select: false },
      verificationCodeExpiresAt: { type: Date, select: false },
    },
    { timestamps: true }
  )
);

const Ride = mongoose.model(
  "Ride",
  new mongoose.Schema(
    {
      driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
      origin: { type: String, required: true, trim: true, maxlength: 120 },
      destination: { type: String, required: true, trim: true, maxlength: 120 },
      departureAt: { type: Date, required: true, index: true },
      seatsTotal: { type: Number, required: true, min: 1, max: 7 },
      seatsAvailable: { type: Number, required: true, min: 0, max: 7 },
      notes: { type: String, trim: true, maxlength: 500, default: "" },
      passengers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      status: { type: String, enum: ["open", "cancelled"], default: "open", index: true },
    },
    { timestamps: true }
  )
);

const Report = mongoose.model(
  "Report",
  new mongoose.Schema(
    {
      reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      ride: { type: mongoose.Schema.Types.ObjectId, ref: "Ride" },
      reason: { type: String, enum: ["conduct", "safety", "fraud", "other"], required: true },
      details: { type: String, trim: true, maxlength: 1000, default: "" },
      status: { type: String, enum: ["open", "reviewed", "dismissed"], default: "open", index: true },
    },
    { timestamps: true }
  )
);

const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET must be set in production.");
}

app.use(
  session({
    name: "ridelink.sid",
    secret: sessionSecret || "local-development-only-change-me",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, dbName: "ridelink" }),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a little and try again." },
});

const rideLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function trustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && origin !== clientUrl) {
    return res.status(403).json({ error: "Request origin is not allowed." });
  }
  next();
}

app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return trustedOrigin(req, res, next);
  next();
});

function publicUser(user) {
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase());
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    isAdmin: adminEmails.includes(user.email),
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Sign in to continue." });
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Sign in to continue." });
  try {
    const user = await User.findById(req.session.userId);
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase());
    if (!user?.emailVerified || !adminEmails.includes(user.email)) {
      return res.status(403).json({ error: "Administrator access is required." });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashCode(code) {
  return crypto.createHash("sha256").update(`${code}:${process.env.SESSION_SECRET || "local"}`).digest("hex");
}

function validStudentEmail(email) {
  return /^[^\s@]+@[^\s@]+\.edu$/i.test(email);
}

async function sendVerificationEmail(email, code) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    if (!isProduction && process.env.ALLOW_DEV_EMAIL_CODE === "true") {
      console.info(`[development] RideLink verification code for ${email}: ${code}`);
      return { developmentCode: code };
    }
    throw new Error("Email delivery is not configured. Set SMTP settings before signing up.");
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: email,
    subject: "Verify your RideLink email",
    text: `Your RideLink verification code is ${code}. It expires in 10 minutes.`,
  });
  return {};
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "RideLink API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!name || !validStudentEmail(email)) {
      return res.status(400).json({ error: "Use your university .edu email and enter your name." });
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Password must be at least 12 characters and no more than 72 bytes." });
    }
    if (await User.exists({ email, emailVerified: true })) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const passwordHash = await bcrypt.hash(password, 12);
    await User.findOneAndUpdate(
      { email },
      {
        name,
        email,
        passwordHash,
        emailVerified: false,
        verificationCodeHash: hashCode(code),
        verificationCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );

    let delivery;
    try {
      delivery = await sendVerificationEmail(email, code);
    } catch (error) {
      await User.deleteOne({ email, emailVerified: false });
      return res.status(503).json({ error: error.message });
    }
    res.status(201).json({
      message: `We sent a verification code to ${email}.`,
      email,
      ...(delivery.developmentCode ? { developmentCode: delivery.developmentCode } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verify-email", authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    const code = cleanText(req.body.code, 6);
    const user = await User.findOne({ email }).select("+verificationCodeHash +verificationCodeExpiresAt");
    if (
      !user || user.emailVerified || !/^\d{6}$/.test(code) ||
      !user.verificationCodeExpiresAt || user.verificationCodeExpiresAt < new Date() ||
      !user.verificationCodeHash ||
      !crypto.timingSafeEqual(Buffer.from(hashCode(code), "hex"), Buffer.from(user.verificationCodeHash, "hex"))
    ) {
      return res.status(400).json({ error: "That code is invalid or has expired. Please sign up again." });
    }
    user.emailVerified = true;
    user.verificationCodeHash = undefined;
    user.verificationCodeExpiresAt = undefined;
    await user.save();
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.json({ user: publicUser(user) });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = cleanText(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Verify your university email before signing in." });
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        res.json({ user: publicUser(user) });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", async (req, res, next) => {
  try {
    if (!req.session.userId) return res.json({ user: null });
    const user = await User.findById(req.session.userId);
    if (!user || !user.emailVerified) {
      return req.session.destroy(() => res.json({ user: null }));
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("ridelink.sid", { httpOnly: true, secure: isProduction, sameSite: "lax" });
    res.json({ ok: true });
  });
});

app.get("/api/rides", requireAuth, rideLimiter, async (req, res, next) => {
  try {
    const filter = { status: "open", seatsAvailable: { $gt: 0 }, departureAt: { $gte: new Date() } };
    if (req.query.from) filter.origin = { $regex: escapeRegex(cleanText(req.query.from, 80)), $options: "i" };
    if (req.query.to) filter.destination = { $regex: escapeRegex(cleanText(req.query.to, 80)), $options: "i" };
    if (req.query.date) {
      const start = new Date(`${req.query.date}T00:00:00`);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.departureAt = { $gte: start, $lt: end };
    }
    const rides = await Ride.find(filter)
      .sort({ departureAt: 1 })
      .limit(100)
      .populate("driver", "name")
      .populate("passengers", "name");
    res.json({ rides });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rides", requireAuth, rideLimiter, async (req, res, next) => {
  try {
    const origin = cleanText(req.body.origin, 120);
    const destination = cleanText(req.body.destination, 120);
    const departureAt = new Date(req.body.departureAt);
    const seats = Number(req.body.seats);
    const notes = cleanText(req.body.notes, 500);
    if (!origin || !destination || origin.toLowerCase() === destination.toLowerCase()) {
      return res.status(400).json({ error: "Enter different starting and destination locations." });
    }
    if (!Number.isFinite(departureAt.getTime()) || departureAt <= new Date()) {
      return res.status(400).json({ error: "Choose a future departure time." });
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 7) {
      return res.status(400).json({ error: "Choose between 1 and 7 available seats." });
    }
    const ride = await Ride.create({
      driver: req.session.userId,
      origin,
      destination,
      departureAt,
      seatsTotal: seats,
      seatsAvailable: seats,
      notes,
    });
    const populated = await ride.populate("driver", "name");
    res.status(201).json({ ride: populated });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rides/:id/join", requireAuth, rideLimiter, async (req, res, next) => {
  try {
    const ride = await Ride.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "open",
        seatsAvailable: { $gt: 0 },
        driver: { $ne: req.session.userId },
        passengers: { $ne: req.session.userId },
        departureAt: { $gt: new Date() },
      },
      { $inc: { seatsAvailable: -1 }, $addToSet: { passengers: req.session.userId } },
      { new: true }
    ).populate("driver", "name").populate("passengers", "name");
    if (!ride) return res.status(409).json({ error: "This ride is full, unavailable, or you already joined it." });
    res.json({ ride });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/rides/:id/join", requireAuth, rideLimiter, async (req, res, next) => {
  try {
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, passengers: req.session.userId, status: "open" },
      { $inc: { seatsAvailable: 1 }, $pull: { passengers: req.session.userId } },
      { new: true }
    ).populate("driver", "name").populate("passengers", "name");
    if (!ride) return res.status(404).json({ error: "You have not joined this ride." });
    res.json({ ride });
  } catch (error) {
    next(error);
  }
});

app.get("/api/my-rides", requireAuth, async (req, res, next) => {
  try {
    const rides = await Ride.find({
      $or: [{ driver: req.session.userId }, { passengers: req.session.userId }],
      status: "open",
    })
      .sort({ departureAt: 1 })
      .populate("driver", "name")
      .populate("passengers", "name");
    res.json({ rides });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/rides/:id", requireAuth, async (req, res, next) => {
  try {
    const ride = await Ride.findOneAndUpdate(
      { _id: req.params.id, driver: req.session.userId, status: "open" },
      { status: "cancelled" },
      { new: true }
    );
    if (!ride) return res.status(404).json({ error: "Ride not found or you are not its driver." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports", requireAuth, rideLimiter, async (req, res, next) => {
  try {
    const { reportedUserId, rideId, reason } = req.body;
    const details = cleanText(req.body.details, 1000);
    if (!mongoose.isValidObjectId(reportedUserId) || reportedUserId === req.session.userId) {
      return res.status(400).json({ error: "Choose a valid user to report." });
    }
    if (!["conduct", "safety", "fraud", "other"].includes(reason)) {
      return res.status(400).json({ error: "Choose a report reason." });
    }
    if (!(await User.exists({ _id: reportedUserId, emailVerified: true }))) {
      return res.status(404).json({ error: "User not found." });
    }
    if (rideId) {
      if (!mongoose.isValidObjectId(rideId) || !(await Ride.exists({ _id: rideId, driver: reportedUserId }))) {
        return res.status(400).json({ error: "Choose a valid ride associated with this user." });
      }
    } else {
      return res.status(400).json({ error: "A ride is required for this report." });
    }
    await Report.create({
      reporter: req.session.userId,
      reportedUser: reportedUserId,
      ride: mongoose.isValidObjectId(rideId) ? rideId : undefined,
      reason,
      details,
    });
    res.status(201).json({ message: "Thanks. Your report has been submitted." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports", requireAdmin, async (req, res, next) => {
  try {
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("reporter", "name email")
      .populate("reportedUser", "name email")
      .populate("ride", "origin destination departureAt");
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/reports/:id", requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!["reviewed", "dismissed", "open"].includes(status)) {
      return res.status(400).json({ error: "Choose a valid report status." });
    }
    const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate("reporter", "name email")
      .populate("reportedUser", "name email")
      .populate("ride", "origin destination departureAt");
    if (!report) return res.status(404).json({ error: "Report not found." });
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set.");
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "ridelink" });
    console.log("Connected to MongoDB");
    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`RideLink API running at http://localhost:${port}`));
  } catch (error) {
    console.error("Could not start RideLink API:", error.message);
    process.exit(1);
  }
}

startServer();
