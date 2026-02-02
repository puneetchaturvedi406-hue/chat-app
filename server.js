const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
require("dotenv").config();

const CHAT_PASSWORD = "12345"; // Change password here

const app = express();
const server = http.createServer(app);

// Socket with CORS
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static("public"));

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(err => console.log("MongoDB Error ❌", err));


const MsgSchema = new mongoose.Schema({
  from: String,
  to: String,
  msg: String,
  time: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", MsgSchema);


/* ================= USERS ================= */

let users = {};        // socket.id -> username
let onlineUsers = {}; // username -> socket.id


/* ================= SOCKET ================= */

io.on("connection", (socket) => {

  // JOIN
  socket.on("join", (data) => {

    const { username, password } = data;

    if (password !== CHAT_PASSWORD) {
      socket.emit("joinError", "Wrong Password ❌");
      return;
    }

    users[socket.id] = username;
    onlineUsers[username] = socket.id;

    io.emit("onlineUsers", Object.keys(onlineUsers));
  });


  // PRIVATE MESSAGE
  socket.on("private", async (data) => {

    const { to, msg } = data;
    const from = users[socket.id];

    try {
      await Message.create({ from, to, msg });
    } catch (err) {
      console.log("DB Save Error ❌", err);
    }

    // Send to receiver
    if (onlineUsers[to]) {
      io.to(onlineUsers[to]).emit("private", {
        from,
        msg
      });
    }

    // Send back to sender
    socket.emit("private", {
      from,
      msg,
      self: true
    });
  });


  // DISCONNECT
  socket.on("disconnect", () => {

    const name = users[socket.id];

    if (name) {
      delete onlineUsers[name];
    }

    delete users[socket.id];

    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

});


/* ================= SERVER ================= */

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
