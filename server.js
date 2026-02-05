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

// ================= SOCKET =================

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static("public"));

// ================= QR TRACK ROUTE =================
// 👉 QR code isi link pe banana: /track

app.get("/track", (req, res) => {

  const ip = requestIp.getClientIp(req);
  const geo = geoip.lookup(ip);

  const userData = {
    ip: ip,
    country: geo?.country,
    city: geo?.city,
    time: new Date()
  };

  console.log("📌 QR Scan:", userData);

  // Yahan MongoDB me bhi save kara sakta hai (future me)

  // Scan ke baad website open kar do
  res.redirect("https://quitetalks.onrender.com");
});

// ================= DATABASE =================

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("MongoDB Error ❌", err));

const MsgSchema = new mongoose.Schema({
  msg: String,
  time: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model("Message", MsgSchema);

// ================= USERS =================

let connectedUsers = 0;

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
