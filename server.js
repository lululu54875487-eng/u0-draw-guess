const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROUND_SECONDS = 80;
const MAX_NAME_LENGTH = 14;

const wordBank = [
  "珍珠奶茶",
  "吐司",
  "雨傘",
  "貓咪",
  "蛋糕",
  "火鍋",
  "泡泡",
  "月亮",
  "手機",
  "拖鞋",
  "小熊",
  "花束",
  "公車",
  "冰淇淋",
  "蝴蝶結",
  "水壺",
  "便當",
  "星星",
  "氣球",
  "蘋果"
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/room/:roomCode", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = new Map();

function makeRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}

function createRoom(roomCode = makeRoomCode()) {
  const room = {
    code: roomCode,
    players: [],
    strokes: [],
    messages: [],
    currentWord: null,
    drawerId: null,
    drawerIndex: -1,
    roundEndsAt: null,
    guessedIds: new Set(),
    timer: null
  };
  rooms.set(roomCode, room);
  return room;
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    score: player.score,
    isHost: player.isHost
  };
}

function roomState(room, viewerId) {
  const viewerIsDrawer = room.drawerId === viewerId;
  return {
    code: room.code,
    players: room.players.map(publicPlayer),
    strokes: room.strokes,
    messages: room.messages.slice(-40),
    drawerId: room.drawerId,
    roundEndsAt: room.roundEndsAt,
    currentWord: viewerIsDrawer ? room.currentWord : null,
    wordHint: room.currentWord ? `${room.currentWord.length} 個字` : null,
    guessedIds: Array.from(room.guessedIds)
  };
}

function emitRoom(room) {
  room.players.forEach((player) => {
    io.to(player.id).emit("room:state", roomState(room, player.id));
  });
}

function addMessage(room, message) {
  room.messages.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: Date.now(),
    ...message
  });
  room.messages = room.messages.slice(-60);
}

function endRound(room, reason = "time") {
  if (!room.currentWord) return;

  const answer = room.currentWord;
  const message =
    reason === "all-guessed"
      ? `大家都猜到了！答案是「${answer}」。`
      : reason === "skip"
        ? `這題跳過囉，答案是「${answer}」。`
        : `時間到！答案是「${answer}」。`;
  clearTimeout(room.timer);
  room.timer = null;
  room.currentWord = null;
  room.drawerId = null;
  room.roundEndsAt = null;
  room.guessedIds.clear();
  room.strokes = [];

  addMessage(room, {
    type: "system",
    text: message
  });
  emitRoom(room);
}

function startRound(room) {
  if (room.players.length < 2) {
    addMessage(room, {
      type: "system",
      text: "至少需要 2 位玩家才能開始。"
    });
    emitRoom(room);
    return;
  }

  clearTimeout(room.timer);
  room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
  const drawer = room.players[room.drawerIndex];
  room.drawerId = drawer.id;
  room.currentWord = wordBank[Math.floor(Math.random() * wordBank.length)];
  room.roundEndsAt = Date.now() + ROUND_SECONDS * 1000;
  room.guessedIds.clear();
  room.strokes = [];

  addMessage(room, {
    type: "system",
    text: `輪到 ${drawer.name} 畫畫了。`
  });

  room.timer = setTimeout(() => endRound(room, "time"), ROUND_SECONDS * 1000);
  emitRoom(room);
}

function getPlayer(room, socketId) {
  return room.players.find((player) => player.id === socketId);
}

function sanitizeRoomCode(roomCode) {
  return String(roomCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function sanitizeName(name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return cleanName || `小畫家${Math.floor(Math.random() * 90) + 10}`;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, callback) => {
    const room = createRoom();
    const player = {
      id: socket.id,
      name: sanitizeName(name),
      score: 0,
      isHost: true
    };
    room.players.push(player);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    addMessage(room, {
      type: "system",
      text: `${player.name} 開了房間。`
    });
    callback?.({ ok: true, roomCode: room.code });
    emitRoom(room);
  });

  socket.on("room:join", ({ roomCode, name }, callback) => {
    const code = sanitizeRoomCode(roomCode);
    const room = rooms.get(code);
    if (!room) {
      callback?.({ ok: false, error: "找不到這個房間，請確認連結是否正確。" });
      return;
    }

    const player = {
      id: socket.id,
      name: sanitizeName(name),
      score: 0,
      isHost: room.players.length === 0
    };
    room.players.push(player);
    socket.join(code);
    socket.data.roomCode = code;
    addMessage(room, {
      type: "system",
      text: `${player.name} 加入遊戲。`
    });
    callback?.({ ok: true, roomCode: code });
    emitRoom(room);
  });

  socket.on("round:start", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = getPlayer(room, socket.id);
    if (!player?.isHost && room.players.length > 1) return;
    startRound(room);
  });

  socket.on("round:skip", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = getPlayer(room, socket.id);
    if (!player?.isHost && room.drawerId !== socket.id) return;
    endRound(room, "skip");
  });

  socket.on("draw:stroke", (stroke) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.drawerId !== socket.id || !room.currentWord) return;
    const safeStroke = {
      color: String(stroke.color || "#4b8fa0").slice(0, 20),
      size: Math.max(2, Math.min(Number(stroke.size) || 6, 30)),
      points: Array.isArray(stroke.points)
        ? stroke.points.slice(0, 300).map((point) => ({
            x: Math.max(0, Math.min(Number(point.x) || 0, 1)),
            y: Math.max(0, Math.min(Number(point.y) || 0, 1))
          }))
        : []
    };

    if (safeStroke.points.length < 1) return;
    room.strokes.push(safeStroke);
    room.strokes = room.strokes.slice(-800);
    socket.to(room.code).emit("draw:stroke", safeStroke);
  });

  socket.on("draw:clear", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.drawerId !== socket.id) return;
    room.strokes = [];
    io.to(room.code).emit("draw:clear");
  });

  socket.on("chat:guess", ({ text }) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room ? getPlayer(room, socket.id) : null;
    if (!room || !player) return;

    const guess = String(text || "").trim().slice(0, 40);
    if (!guess) return;

    if (room.currentWord && socket.id !== room.drawerId && guess === room.currentWord && !room.guessedIds.has(socket.id)) {
      room.guessedIds.add(socket.id);
      player.score += 10;
      const drawer = getPlayer(room, room.drawerId);
      if (drawer) drawer.score += 3;
      addMessage(room, {
        type: "correct",
        playerName: player.name,
        text: `${player.name} 猜中了！`
      });
      const guessers = room.players.filter((item) => item.id !== room.drawerId);
      if (guessers.length > 0 && guessers.every((item) => room.guessedIds.has(item.id))) {
        endRound(room, "all-guessed");
        return;
      }
      emitRoom(room);
      return;
    }

    addMessage(room, {
      type: "guess",
      playerName: player.name,
      text: guess
    });
    io.to(room.code).emit("chat:message", room.messages[room.messages.length - 1]);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;

    const leavingPlayer = getPlayer(room, socket.id);
    room.players = room.players.filter((player) => player.id !== socket.id);

    if (leavingPlayer) {
      addMessage(room, {
        type: "system",
        text: `${leavingPlayer.name} 離開了。`
      });
    }

    if (room.players.length === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }

    if (!room.players.some((player) => player.isHost)) {
      room.players[0].isHost = true;
    }

    if (room.drawerId === socket.id) {
      endRound(room, "skip");
      return;
    }

    emitRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`小u0畫畫猜猜 server running on http://localhost:${PORT}`);
});
