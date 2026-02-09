const cookieParser = require("cookie-parser");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

const axios = require("axios");
const requestIp = require("request-ip");

const app = express();
const server = http.createServer(app);

// ================= CONFIG =================

const CHAT_PASSWORD = "NAVRIDHI";
const MAX_USERS = 2;
const ADMIN_PASSWORD = "NAVRIDHI";

// ================= MIDDLEWARE =================

app.use(express.static("public"));
app.use(express.json());
app.use(cookieParser());

// ================= SOCKET =================

const io = new Server(server, {
  cors: { origin: "*" }
});

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("MongoDB Error ❌", err));

// ================= MESSAGE SCHEMA =================

const MsgSchema = new mongoose.Schema({
  msg: String,
  deleted: { type: Boolean, default: false },
  seen: { type: Boolean, default: false },
  time: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", MsgSchema);

// ================= SCAN SCHEMA =================

const ScanSchema = new mongoose.Schema({
  ip: String,
  country: String,
  city: String,
  time: { type: Date, default: Date.now }
});

const Scan = mongoose.model("Scan", ScanSchema);

// ================= USERS =================

let connectedUsers = 0;

// ================= TRACK ROUTE =================

app.get("/track", async (req, res) => {

  let ip = requestIp.getClientIp(req);
  if (ip && ip.includes("::ffff:")) ip = ip.split("::ffff:")[1];

  let country = "Unknown";
  let city = "Unknown";

  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    country = response.data.countryCode || "Unknown";
    city = response.data.city || "Unknown";
  } catch {
    console.log("Location API Error ❌");
  }

  try {
    await Scan.create({ ip, country, city });
  } catch (err) {
    console.log("Scan Save Error ❌", err);
  }

  res.redirect("/");
});

// ================= ADMIN AUTH =================

app.post("/admin-login", (req, res) => {

  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {

    res.cookie("admin_auth", "yes", {
      httpOnly: true,
      secure: true,        // HTTPS (Render)
      sameSite: "strict",
      maxAge: 1000 * 60 * 60
    });

    res.json({ success: true });

  } else {
    res.json({ success: false });
  }
});

// ================= ADMIN DATA =================

app.get("/admin-data", async (req, res) => {

  if (req.cookies.admin_auth !== "yes") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const messages = await Message.find().sort({ time: -1 }).limit(100);
    const scans = await Scan.find().sort({ time: -1 }).limit(100);

    res.json({
      users: connectedUsers,
      messages,
      scans
    });

  } catch (err) {
    console.log("Admin Error ❌", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ================= DELETE MESSAGE (ADMIN ONLY) =================

app.delete("/delete/:id", async (req, res) => {

  if (req.cookies.admin_auth !== "yes") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await Message.findByIdAndUpdate(req.params.id, { deleted: true });
    res.json({ success: true });
  } catch (err) {
    console.log("Delete Error ❌", err);
    res.json({ success: false });
  }
});

// ================= LOGOUT =================

app.get("/admin-logout", (req, res) => {
  res.clearCookie("admin_auth");
  res.json({ success: true });
});

// ================= SOCKET =================

io.on("connection", (socket) => {

  socket.joined = false;
  console.log("New user:", socket.id);

  // JOIN
  socket.on("join", async (password) => {

    if (password !== CHAT_PASSWORD) {
      socket.emit("joinError", "Wrong Password ❌");
      return;
    }

    if (connectedUsers >= MAX_USERS) {
      socket.emit("joinError", "Room Full ❌");
      return;
    }

    socket.joined = true;
    connectedUsers++;

    socket.join("privateRoom");
    io.to("privateRoom").emit("onlineCount", connectedUsers);

    const oldMessages = await Message.find({ deleted: false })
      .sort({ time: 1 })
      .limit(100);

    socket.emit("oldMessages", oldMessages);
    socket.emit("joinSuccess", "Joined ✅");
  });

  // MESSAGE
  socket.on("message", async (msg) => {
    try {
      const newMsg = await Message.create({ msg });
      io.to("privateRoom").emit("message", newMsg);
    } catch {
      console.log("Message Error ❌");
    }
  });

  // SEEN
  socket.on("seen", async (id) => {
    await Message.findByIdAndUpdate(id, { seen: true });
    io.to("privateRoom").emit("seen", id);
  });

  // TYPING
  socket.on("typing", () => socket.to("privateRoom").emit("typing"));
  socket.on("stopTyping", () => socket.to("privateRoom").emit("stopTyping"));

  // DISCONNECT
  socket.on("disconnect", () => {

    if (socket.joined && connectedUsers > 0) {
      connectedUsers--;
    }

    io.to("privateRoom").emit("onlineCount", connectedUsers);

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    io.to("privateRoom").emit("lastSeen", time);
    console.log("User disconnected ❌");
  });
});

// ================= SERVER =================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
