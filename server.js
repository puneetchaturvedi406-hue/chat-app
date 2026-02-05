const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

// QR Tracking Packages
const requestIp = require("request-ip");
const geoip = require("geoip-lite");

const app = express();
const server = http.createServer(app);

// ================= CONFIG =================

const CHAT_PASSWORD = "NAVRIDHI"; // Change password here
const MAX_USERS = 2;
const ADMIN_PASSWORD = "NAVRIDHI";

// ================= MIDDLEWARE =================

app.use(express.static("public"));
app.use(express.json());

// ================= SOCKET =================

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("MongoDB Error ❌", err));

// ================= MESSAGE SCHEMA =================

const MsgSchema = new mongoose.Schema({
  msg: String,
  time: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model("Message", MsgSchema);

// ================= SCAN SCHEMA =================

const ScanSchema = new mongoose.Schema({
  ip: String,
  country: String,
  city: String,
  time: {
    type: Date,
    default: Date.now
  }
});

const Scan = mongoose.model("Scan", ScanSchema);

// ================= USERS =================

let connectedUsers = 0;

// ================= QR TRACK ROUTE =================

app.get("/track", async (req, res) => {

  const ip = requestIp.getClientIp(req);
  const geo = geoip.lookup(ip);

  const scanData = {
    ip: ip,
    country: geo?.country || "Unknown",
    city: geo?.city || "Unknown"
  };

  console.log("📌 QR Scan:", scanData);

  // Save in DB
  try {
    await Scan.create(scanData);
  } catch (err) {
    console.log("Scan Save Error ❌", err);
  }

  res.redirect("https://quitetalks.onrender.com");
});

// ================= ADMIN PANEL =================

// Admin Login
app.post("/admin-login", (req, res) => {

  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Admin Data
app.get("/admin-data", async (req, res) => {

  try {

    const messages = await Message.find()
      .sort({ time: -1 })
      .limit(50);

    const scans = await Scan.find()
      .sort({ time: -1 })
      .limit(100);

    res.json({
      users: connectedUsers,
      messages: messages,
      scans: scans
    });

  } catch (err) {
    console.log("Admin Error ❌", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ================= SOCKET LOGIC =================

io.on("connection", (socket) => {

  console.log("New user connected:", socket.id);

  // JOIN WITH PASSWORD
  socket.on("join", async (password) => {

    if (password !== CHAT_PASSWORD) {
      socket.emit("joinError", "Wrong Password ❌");
      return;
    }

    if (connectedUsers >= MAX_USERS) {
      socket.emit("joinError", "Room Full ❌");
      return;
    }

    connectedUsers++;

    socket.join("privateRoom");

    console.log("User joined room ✅");

    // Send old messages
    const oldMessages = await Message.find()
      .sort({ time: 1 })
      .limit(100);

    socket.emit("oldMessages", oldMessages);

    socket.emit("joinSuccess", "Joined Successfully ✅");
  });

  // SEND MESSAGE
  socket.on("message", async (msg) => {

    try {

      const newMsg = await Message.create({ msg });

      io.to("privateRoom").emit("message", newMsg);

    } catch (err) {
      console.log("DB Save Error ❌", err);
    }

  });

  // DISCONNECT
  socket.on("disconnect", () => {

    if (connectedUsers > 0) {
      connectedUsers--;
    }

    console.log("User disconnected ❌");
  });

});

// ================= SERVER =================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
