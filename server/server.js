require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "RideLink API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "ridelink" });
    console.log("Connected to MongoDB");

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`RideLink API running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Could not connect to MongoDB:", error.message);
    process.exit(1);
  }
}

startServer();
