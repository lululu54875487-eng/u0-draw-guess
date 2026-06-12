const socket = io();

const joinView = document.querySelector("#joinView");
const gameView = document.querySelector("#gameView");
const joinForm = document.querySelector("#joinForm");
const nameInput = document.querySelector("#nameInput");
const roomInput = document.querySelector("#roomInput");
const createRoomButton = document.querySelector("#createRoomButton");
const joinError = document.querySelector("#joinError");
const roomCodeLabel = document.querySelector("#roomCodeLabel");
const copyLinkButton = document.querySelector("#copyLinkButton");
const roundTitle = document.querySelector("#roundTitle");
const hintLabel = document.querySelector("#hintLabel");
const timerLabel = document.querySelector("#timerLabel");
const roleLabel = document.querySelector("#roleLabel");
const playersList = document.querySelector("#playersList");
const startButton = document.querySelector("#startButton");
const categorySelect = document.querySelector("#categorySelect");
const customWordsInput = document.querySelector("#customWordsInput");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const settingsHint = document.querySelector("#settingsHint");
const messagesList = document.querySelector("#messagesList");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const canvas = document.querySelector("#drawCanvas");
const ctx = canvas.getContext("2d");
const canvasBlocker = document.querySelector("#canvasBlocker");
const clearButton = document.querySelector("#clearButton");
const brushSize = document.querySelector("#brushSize");
const brushSizeValue = document.querySelector("#brushSizeValue");
const swatches = Array.from(document.querySelectorAll(".swatch"));
const sizePresetButtons = Array.from(document.querySelectorAll(".size-presets button"));
const emojiButtons = Array.from(document.querySelectorAll(".emoji-row button"));

const urlRoomCode = location.pathname.match(/\/room\/([A-Za-z0-9]+)/)?.[1];
if (urlRoomCode) {
  roomInput.value = urlRoomCode.toUpperCase();
}

let state = null;
let brushColor = "#4b8fa0";
let drawing = false;
let currentStroke = null;
let countdownId = null;
let settingsDirty = false;

function setError(message = "") {
  joinError.textContent = message;
}

function playerName() {
  return nameInput.value.trim() || localStorage.getItem("u0-player-name") || "";
}

function rememberName() {
  const name = nameInput.value.trim();
  if (name) localStorage.setItem("u0-player-name", name);
}

function enterGame() {
  joinView.hidden = true;
  gameView.hidden = false;
}

function roomLink(code) {
  return `${location.origin}/room/${code}`;
}

function requestCreateRoom() {
  rememberName();
  socket.emit("room:create", { name: playerName() }, (response) => {
    if (!response?.ok) {
      setError(response?.error || "開房間失敗，請稍後再試。");
      return;
    }
    history.replaceState(null, "", `/room/${response.roomCode}`);
    enterGame();
  });
}

function requestJoinRoom() {
  rememberName();
  const roomCode = roomInput.value.trim();
  if (!roomCode) {
    setError("請輸入房間代碼，或直接開新房間。");
    return;
  }
  socket.emit("room:join", { roomCode, name: playerName() }, (response) => {
    if (!response?.ok) {
      setError(response?.error || "加入失敗，請稍後再試。");
      return;
    }
    history.replaceState(null, "", `/room/${response.roomCode}`);
    enterGame();
  });
}

function resizeCanvasForDisplay() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * scale);
  const height = Math.round(rect.height * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    renderCanvas();
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawStroke(stroke) {
  if (!stroke?.points?.length) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size * (window.devicePixelRatio || 1);

  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * canvas.width;
    const y = point.y * canvas.height;
    if (index === 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y + 0.01);
      return;
    }
    ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function renderCanvas() {
  clearCanvas();
  state?.strokes?.forEach(drawStroke);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1)),
    y: Math.max(0, Math.min((event.clientY - rect.top) / rect.height, 1))
  };
}

function canDraw() {
  return state?.drawerId === socket.id && Boolean(state?.currentWord);
}

function currentBrushSize() {
  return Number(brushSize.value);
}

function updateBrushSizeLabel() {
  brushSizeValue.textContent = brushSize.value;
  sizePresetButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.size) === Number(brushSize.value));
  });
}

function beginDraw(event) {
  if (!canDraw()) return;
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  drawing = true;
  currentStroke = {
    color: brushColor,
    size: currentBrushSize(),
    points: [canvasPoint(event)]
  };
  drawStroke(currentStroke);
}

function moveDraw(event) {
  if (!drawing || !currentStroke) return;
  event.preventDefault();
  const point = canvasPoint(event);
  const previous = currentStroke.points[currentStroke.points.length - 1];
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.003) return;
  currentStroke.points.push(point);
  drawStroke({
    ...currentStroke,
    points: currentStroke.points.slice(-2)
  });
}

function endDraw(event) {
  if (!drawing || !currentStroke) return;
  event.preventDefault();
  drawing = false;
  canvas.releasePointerCapture?.(event.pointerId);
  if (state) state.strokes.push(currentStroke);
  socket.emit("draw:stroke", currentStroke);
  currentStroke = null;
}

function updateCountdown() {
  if (!state?.roundEndsAt) {
    timerLabel.textContent = "--";
    return;
  }
  const seconds = Math.max(0, Math.ceil((state.roundEndsAt - Date.now()) / 1000));
  timerLabel.textContent = `${seconds}s`;
}

function startCountdown() {
  clearInterval(countdownId);
  updateCountdown();
  countdownId = setInterval(updateCountdown, 500);
}

function messageMarkup(message) {
  const item = document.createElement("div");
  item.className = `message ${message.type || "guess"}`;
  if (message.type === "guess") {
    const strong = document.createElement("strong");
    strong.textContent = `${message.playerName}: `;
    item.append(strong, document.createTextNode(message.text));
    return item;
  }
  item.textContent = message.text;
  return item;
}

function renderMessages(messages) {
  messagesList.replaceChildren(...messages.map(messageMarkup));
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderPlayers(players) {
  playersList.replaceChildren(
    ...players.map((player) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const score = document.createElement("span");
      name.className = "player-name";
      score.className = "player-score";
      const badges = [
        player.isHost ? "房主" : "",
        state.drawerId === player.id ? "畫畫" : "",
        state.guessedIds?.includes(player.id) ? "猜中" : ""
      ].filter(Boolean);
      name.textContent = `${player.name}${badges.length ? ` · ${badges.join(" · ")}` : ""}`;
      score.textContent = `${player.score}`;
      item.append(name, score);
      return item;
    })
  );
}

function categoryLabel(categoryId) {
  return state?.categoryOptions?.find((item) => item.id === categoryId)?.label || "全部混合";
}

function renderSettings(isHost) {
  if (!settingsDirty) {
    categorySelect.value = state.settings?.category || "mixed";
    customWordsInput.value = (state.settings?.customWords || []).join("\n");
  }

  const locked = !isHost || Boolean(state.roundEndsAt);
  categorySelect.disabled = locked;
  customWordsInput.disabled = locked;
  saveSettingsButton.hidden = !isHost;
  saveSettingsButton.disabled = locked || !settingsDirty;

  if (!isHost) {
    settingsHint.textContent = `房主目前選擇：${categoryLabel(state.settings?.category)}，自訂 ${state.settings?.customWords?.length || 0} 題。`;
  } else if (state.roundEndsAt) {
    settingsHint.textContent = "回合進行中不能修改題庫。";
  } else {
    settingsHint.textContent = "自訂題目一行一題；選「只玩自訂題目」時，請至少填 1 題。";
  }
}

function renderState(nextState) {
  state = nextState;
  const me = state.players.find((player) => player.id === socket.id);
  const drawer = state.players.find((player) => player.id === state.drawerId);
  const isDrawer = state.drawerId === socket.id;
  const isHost = Boolean(me?.isHost);
  const isSolo = state.players.length === 1;

  roomCodeLabel.textContent = state.code;
  roundTitle.textContent = state.currentWord
    ? `題目：${state.currentWord}`
    : drawer
      ? `${drawer.name} 正在畫畫`
      : "等待開始";
  hintLabel.textContent = state.currentWord || state.wordHint || categoryLabel(state.settings?.category);
  roleLabel.textContent = isDrawer ? "你是畫畫的人" : "你來猜";
  startButton.textContent = state.roundEndsAt ? "結束本題" : "開始";
  startButton.hidden = !isHost;
  clearButton.disabled = !isDrawer;
  guessInput.disabled = isDrawer && Boolean(state.currentWord) && !isSolo;
  guessInput.placeholder =
    isDrawer && state.currentWord && !isSolo
      ? "你負責畫，不能猜唷"
      : isSolo && state.currentWord
        ? "單人練習：可輸入答案或聊天"
        : "輸入答案或聊天";

  if (state.roundEndsAt && !isDrawer) {
    canvasBlocker.textContent = drawer ? `${drawer.name} 正在畫，快猜！` : "快猜答案";
    canvasBlocker.classList.add("is-hidden");
  } else if (state.roundEndsAt && isDrawer) {
    canvasBlocker.classList.add("is-hidden");
  } else {
    canvasBlocker.textContent = "等待房主開始下一題";
    canvasBlocker.classList.remove("is-hidden");
  }

  renderPlayers(state.players);
  renderSettings(isHost);
  renderMessages(state.messages);
  renderCanvas();
  startCountdown();
}

function saveSettings() {
  saveSettingsButton.disabled = true;
  socket.emit(
    "room:updateSettings",
    {
      category: categorySelect.value,
      customWords: customWordsInput.value
    },
    (response) => {
      if (!response?.ok) {
        settingsHint.textContent = response?.error || "題庫更新失敗，請稍後再試。";
        saveSettingsButton.disabled = false;
        return;
      }
      settingsDirty = false;
      saveSettingsButton.textContent = "已套用";
      setTimeout(() => {
        saveSettingsButton.textContent = "套用";
      }, 1200);
    }
  );
}

function insertEmoji(emoji) {
  if (guessInput.disabled) return;
  const start = guessInput.selectionStart ?? guessInput.value.length;
  const end = guessInput.selectionEnd ?? guessInput.value.length;
  guessInput.value = `${guessInput.value.slice(0, start)}${emoji}${guessInput.value.slice(end)}`.slice(0, 60);
  const cursor = Math.min(start + emoji.length, guessInput.value.length);
  guessInput.focus();
  guessInput.setSelectionRange(cursor, cursor);
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestJoinRoom();
});

createRoomButton.addEventListener("click", requestCreateRoom);

copyLinkButton.addEventListener("click", async () => {
  if (!state?.code) return;
  const link = roomLink(state.code);
  try {
    await navigator.clipboard.writeText(link);
    copyLinkButton.textContent = "已複製";
  } catch {
    prompt("複製邀請連結", link);
  }
  setTimeout(() => {
    copyLinkButton.textContent = "邀請";
  }, 1400);
});

startButton.addEventListener("click", () => {
  if (state?.roundEndsAt) {
    socket.emit("round:skip");
    return;
  }
  socket.emit("round:start");
});

categorySelect.addEventListener("change", () => {
  settingsDirty = true;
  saveSettingsButton.disabled = false;
});

customWordsInput.addEventListener("input", () => {
  settingsDirty = true;
  saveSettingsButton.disabled = false;
});

saveSettingsButton.addEventListener("click", saveSettings);

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = guessInput.value.trim();
  if (!text || guessInput.disabled) return;
  socket.emit("chat:guess", { text });
  guessInput.value = "";
});

clearButton.addEventListener("click", () => {
  if (!canDraw()) return;
  socket.emit("draw:clear");
});

swatches.forEach((swatch) => {
  swatch.addEventListener("click", () => {
    brushColor = swatch.dataset.color;
    swatches.forEach((item) => item.classList.toggle("is-active", item === swatch));
  });
});

brushSize.addEventListener("input", updateBrushSizeLabel);

sizePresetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    brushSize.value = button.dataset.size;
    updateBrushSizeLabel();
  });
});

emojiButtons.forEach((button) => {
  button.addEventListener("click", () => insertEmoji(button.dataset.emoji));
});

canvas.addEventListener("pointerdown", beginDraw);
canvas.addEventListener("pointermove", moveDraw);
canvas.addEventListener("pointerup", endDraw);
canvas.addEventListener("pointercancel", endDraw);
canvas.addEventListener("pointerleave", endDraw);
window.addEventListener("resize", resizeCanvasForDisplay);

socket.on("room:state", renderState);
socket.on("draw:stroke", (stroke) => {
  if (!state) return;
  state.strokes.push(stroke);
  drawStroke(stroke);
});
socket.on("draw:clear", () => {
  if (state) state.strokes = [];
  clearCanvas();
});
socket.on("chat:message", (message) => {
  if (!state) return;
  state.messages.push(message);
  renderMessages(state.messages);
});

const savedName = localStorage.getItem("u0-player-name");
if (savedName) nameInput.value = savedName;

updateBrushSizeLabel();
resizeCanvasForDisplay();
