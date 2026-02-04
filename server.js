const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

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

    // Send old messages (offline messages)
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

      // Send to both users
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
