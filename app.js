const SAVE_KEY = "astranova-dialogue-save-v2";
const BGM_SETTING_KEY = "astranova-bgm-enabled";
const SFX_SETTING_KEY = "astranova-sfx-enabled";
const SFX_VOLUME_MULTIPLIER = 4;
const RELATION_KEYS = ["distant", "familiar", "intimate"];
const CHARACTER_NAMES = Object.keys(CHARACTERS);
const LOCKED_CHARACTERS = new Set(["Lumi"]);
const EXPRESSION_ANIMATIONS = {
  "待機": "emotion-idle",
  "喜": "emotion-happy",
  "怒": "emotion-angry",
  "哀": "emotion-sad",
  "樂": "emotion-joy",
  "羞": "emotion-shy",
  "驚": "emotion-surprised",
  "思考": "emotion-thinking"
};

const initialState = {
  current: "Asteria",
  affection: { Asteria: 0, Nyx: 0, Lumi: 0 },
  dates: { Asteria: [], Nyx: [], Lumi: [] },
  used: {
    Asteria: { distant: [], familiar: [], intimate: [] },
    Nyx: { distant: [], familiar: [], intimate: [] },
    Lumi: { distant: [], familiar: [], intimate: [] }
  }
};

const savedState = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
const game = savedState || structuredClone(initialState);
const $ = (selector) => document.querySelector(selector);
const bgm = $("#bgm");
const bgmButton = $("#bgm-button");
const sfxButton = $("#sfx-button");
let bgmEnabled = localStorage.getItem(BGM_SETTING_KEY) !== "false";
let sfxEnabled = localStorage.getItem(SFX_SETTING_KEY) !== "false";
let sfxContext = null;
let dialogueState = "idle";

bgm.volume = 0.28;

function updateBgmButton() {
  bgmButton.setAttribute("aria-pressed", String(bgmEnabled));
  bgmButton.setAttribute("aria-label", bgmEnabled ? "關閉背景音樂" : "開啟背景音樂");
  bgmButton.title = `背景音樂：${bgmEnabled ? "開啟" : "關閉"}`;
}

function playBgm() {
  if (!bgmEnabled || !bgm.paused) return;
  const playback = bgm.play();
  if (playback) playback.catch(() => {});
}

function toggleBgm() {
  bgmEnabled = !bgmEnabled;
  localStorage.setItem(BGM_SETTING_KEY, String(bgmEnabled));
  if (bgmEnabled) playBgm();
  else bgm.pause();
  updateBgmButton();
}

function updateSfxButton() {
  sfxButton.setAttribute("aria-pressed", String(sfxEnabled));
  sfxButton.setAttribute("aria-label", sfxEnabled ? "關閉音效" : "開啟音效");
  sfxButton.title = `音效：${sfxEnabled ? "開啟" : "關閉"}`;
}

function getSfxContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sfxContext) sfxContext = new AudioContextClass();
  if (sfxContext.state === "suspended") {
    sfxContext.resume().catch(() => {});
  }
  return sfxContext;
}

function playTone({
  frequency,
  endFrequency = frequency,
  duration = 0.08,
  volume = 0.02,
  delay = 0,
  type = "sine",
}) {
  if (!sfxEnabled) return;
  const context = getSfxContext();
  if (!context) return;

  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const audibleVolume = Math.min(0.18, volume * SFX_VOLUME_MULTIPLIER);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    start + duration,
  );
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(audibleVolume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function playSfx(kind = "click") {
  if (!sfxEnabled) return;

  if (kind === "select") {
    playTone({ frequency: 430, endFrequency: 620, duration: 0.08, volume: 0.022, type: "triangle" });
    playTone({ frequency: 760, endFrequency: 820, duration: 0.06, volume: 0.014, delay: 0.045 });
    return;
  }

  if (kind === "room") {
    playTone({ frequency: 300, endFrequency: 650, duration: 0.16, volume: 0.018 });
    return;
  }

  if (kind === "positive") {
    playTone({ frequency: 620, endFrequency: 680, duration: 0.1, volume: 0.021 });
    playTone({ frequency: 880, endFrequency: 960, duration: 0.12, volume: 0.019, delay: 0.07 });
    return;
  }

  if (kind === "neutral") {
    playTone({ frequency: 330, endFrequency: 270, duration: 0.09, volume: 0.016, type: "triangle" });
    return;
  }

  playTone({ frequency: 560, endFrequency: 720, duration: 0.055, volume: 0.018 });
}

function toggleSfx() {
  sfxEnabled = !sfxEnabled;
  localStorage.setItem(SFX_SETTING_KEY, String(sfxEnabled));
  updateSfxButton();
  if (sfxEnabled) playSfx("positive");
}

function normalizeState() {
  game.affection ||= structuredClone(initialState.affection);
  game.dates ||= structuredClone(initialState.dates);
  game.used ||= structuredClone(initialState.used);
  for (const name of CHARACTER_NAMES) {
    game.affection[name] ??= 0;
    game.dates[name] ||= [];
    game.used[name] ||= {};
    for (const relation of RELATION_KEYS) game.used[name][relation] ||= [];
  }
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(game));
}

function relationKey(name = game.current) {
  const value = game.affection[name];
  if (value < 30) return "distant";
  if (value <= 60) return "familiar";
  return "intimate";
}

function relationshipStatus(value) {
  if (value < 30) return { emoji: "🌱", text: "陌生" };
  if (value <= 60) return { emoji: "✨", text: "熟悉" };
  return { emoji: "💖", text: "親近" };
}

function relationshipName(name = game.current) {
  if (name === "Asteria") return "好感度";
  if (name === "Nyx") return "信賴度";
  return "親密度";
}

function pendingDate(name = game.current) {
  return DATE_LEVELS.find((level) => (
    game.affection[name] >= level && !game.dates[name].includes(level)
  ));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 1700);
}

function resetPoolIfNeeded(name, relation) {
  const fullPool = DIALOGUES[name][relation];
  if (game.used[name][relation].length >= fullPool.length) {
    game.used[name][relation] = [];
  }
}

function availableScenes(name, relation) {
  resetPoolIfNeeded(name, relation);
  const used = game.used[name][relation];
  return DIALOGUES[name][relation].filter((scene) => !used.includes(scene.id));
}

function drawScene(name, relation) {
  const available = availableScenes(name, relation);
  const scene = available[Math.floor(Math.random() * available.length)];
  game.used[name][relation].push(scene.id);
  saveGame();
  return scene;
}

function drawPlayerTopics(name, relation) {
  const selected = availableScenes(name, relation)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);
  game.used[name][relation].push(...selected.map((scene) => scene.id));
  saveGame();
  return selected;
}

function renderCharacterList() {
  $("#character-list").innerHTML = CHARACTER_NAMES.map((name) => {
    const data = CHARACTERS[name];
    const value = game.affection[name];
    const status = relationshipStatus(value);
    const locked = LOCKED_CHARACTERS.has(name);
    return `
      <button class="character-card ${name === game.current ? "active" : ""} ${locked ? "is-locked" : ""}"
        data-character="${name}"
        aria-label="${locked ? `${name}，未開放` : name}"
        style="--accent:${data.accent};${data.roomImage ? `--card-room-image:url('${data.roomImage}')` : ""}">
        <span class="relationship-status ${locked ? "unavailable" : ""}">${locked ? "🔒 未開放" : `${status.emoji} ${status.text}`}</span>
        <h3>${name}</h3>
        <div class="affection-bar"><span style="width:${value}%"></span></div>
        <p>${value} / 100</p>
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-character]").forEach((button) => {
    button.addEventListener("click", () => switchCharacter(button.dataset.character));
  });
}

function renderRoom() {
  const name = game.current;
  const data = CHARACTERS[name];
  const locked = LOCKED_CHARACTERS.has(name);
  dialogueState = "idle";
  $("#room").innerHTML = `
    <div class="room" style="--room:${data.room};--glow:${data.glow};--hair:${data.hair};--dress:${data.dress};--skin:${data.skin};${data.roomImage ? `--room-image:url('${data.roomImage}')` : ""}">
      <div id="toast" class="toast"></div>
      <div class="avatar-area" id="avatar-area">
        ${data.expressions
          ? `<img id="character-sprite" class="character-sprite emotion-idle" src="${data.expressions["待機"]}" alt="${name} 待機立繪">`
          : '<div class="avatar-placeholder"></div>'}
      </div>
      <div class="dialogue-box" id="dialogue-box">
        <div class="speaker" id="speaker">${name}</div>
        <div class="dialogue-line" id="dialogue-line">${locked ? "未開放" : data.opening}</div>
        <div id="choice-list" class="choice-list">
          <button id="talk-button" class="choice start-dialogue ${locked ? "unavailable" : ""}" ${locked ? "disabled" : ""}>${locked ? "未開放" : "開始對話"}</button>
        </div>
      </div>
    </div>
  `;
  if (!locked) $("#talk-button").addEventListener("click", startDialogue);
  $("#avatar-area").addEventListener("click", handleDialogueSurfaceClick);
  $("#dialogue-box").addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    handleDialogueSurfaceClick();
  });
}

function handleDialogueSurfaceClick() {
  if (LOCKED_CHARACTERS.has(game.current)) return;
  if (dialogueState === "finished") {
    playSfx("click");
    renderRoom();
    return;
  }
  if (dialogueState === "idle") {
    playSfx("select");
    startDialogue();
  }
}

function setExpression(mood) {
  const sprite = $("#character-sprite");
  const source = CHARACTERS[game.current].expressions?.[mood];
  if (sprite && source) {
    sprite.src = source;
    sprite.alt = `${game.current} ${mood}立繪`;
    sprite.classList.remove(...Object.values(EXPRESSION_ANIMATIONS));
    void sprite.offsetWidth;
    sprite.classList.add(EXPRESSION_ANIMATIONS[mood] || "emotion-idle");
  }
}

function switchCharacter(name) {
  const changed = game.current !== name;
  game.current = name;
  saveGame();
  renderRoom();
  renderCharacterList();
  playSfx(changed ? "room" : "click");
}

function startDialogue() {
  if (LOCKED_CHARACTERS.has(game.current)) return;
  const level = pendingDate();
  if (level) {
    openDate(game.current, level, false);
    return;
  }

  const name = game.current;
  const relation = relationKey();
  const remaining = availableScenes(name, relation).length;
  const mode = remaining >= 2 && Math.random() < 0.5 ? "player" : "character";
  dialogueState = "active";

  if (mode === "player") {
    const topics = drawPlayerTopics(name, relation);
    $("#speaker").textContent = "你";
    $("#dialogue-line").textContent = "";
    setExpression("待機");
    $("#choice-list").innerHTML = topics.map((scene, index) => `
      <button class="choice" data-topic="${index}">${scene.topic}</button>
    `).join("");
    document.querySelectorAll("[data-topic]").forEach((button) => {
      button.addEventListener("click", () => beginScene(topics[Number(button.dataset.topic)]));
    });
    return;
  }

  beginScene(drawScene(name, relation));
}

function beginScene(scene) {
  game.activeScene = scene;

  $("#speaker").textContent = game.current;
  $("#dialogue-line").textContent = scene.line;
  setExpression(scene.mood);
  $("#choice-list").innerHTML = scene.choices.map((choice, index) => `
    <button class="choice" data-response="${index}">${choice.text}</button>
  `).join("");
  document.querySelectorAll("[data-response]").forEach((button) => {
    button.addEventListener("click", () => finishScene(Number(button.dataset.response)));
  });
}

function finishScene(index) {
  const choice = game.activeScene.choices[index];
  playSfx(choice.gain > 0 ? "positive" : "neutral");
  const name = game.current;
  game.affection[name] = Math.min(100, game.affection[name] + choice.gain);
  saveGame();

  $("#speaker").textContent = name;
  $("#dialogue-line").textContent = choice.reply;
  setExpression(choice.mood);
  $("#choice-list").innerHTML = "";
  $("#dialogue-box").classList.add("dialogue-finished");
  dialogueState = "finished";
  renderCharacterList();
  showToast(`${relationshipName()} +${choice.gain}`);
}

function openDate(name, level, memoryMode) {
  if (LOCKED_CHARACTERS.has(name)) return;
  const scene = DATE_SCENES[name][DATE_LEVELS.indexOf(level)];
  const data = CHARACTERS[name];
  const paragraphs = scene.text.map((paragraph) => `<p>${paragraph}</p>`).join("");

  document.body.insertAdjacentHTML("beforeend", `
    <div class="overlay" id="date-overlay" style="--cg-glow:${data.glow};--cg-dark:${data.room}">
      <section class="modal-panel">
        <button class="button button-quiet close-button" id="close-date">關閉</button>
        <p class="eyebrow">${name} · ${memoryMode ? "回想" : "外出事件"}</p>
        <h2>${scene.title}</h2>
        <div class="date-cg">${scene.cg ? `<img src="${scene.cg}" alt="${scene.title}">` : "CG 佔位圖"}</div>
        <div class="date-story">${paragraphs}</div>
        ${memoryMode ? "" : '<button class="button button-primary" id="finish-date">結束外出</button>'}
      </section>
    </div>
  `);

  $("#close-date").addEventListener("click", () => $("#date-overlay").remove());
  if (!memoryMode) {
    $("#finish-date").addEventListener("click", () => {
      if (!game.dates[name].includes(level)) game.dates[name].push(level);
      saveGame();
      $("#date-overlay").remove();
      renderRoom();
      renderCharacterList();
      showToast("新的回想已解鎖");
    });
  }
}

function renderMemory() {
  $("#memory-list").innerHTML = CHARACTER_NAMES.flatMap((name) => (
    DATE_LEVELS.map((level, index) => {
      const scene = DATE_SCENES[name][index];
      const lockedCharacter = LOCKED_CHARACTERS.has(name);
      const unlocked = !lockedCharacter && game.dates[name].includes(level);
      return `
        <article class="memory-card ${unlocked ? "" : "locked"}">
          <b>${name}｜${scene.title}</b>
          <p>${lockedCharacter ? "未開放" : unlocked ? "已解鎖" : `${level} 解鎖`}</p>
          ${unlocked ? `<button class="button button-quiet" data-memory="${name}|${level}">查看劇情</button>` : ""}
        </article>
      `;
    })
  )).join("");

  document.querySelectorAll("[data-memory]").forEach((button) => {
    button.addEventListener("click", () => {
      const [name, level] = button.dataset.memory.split("|");
      openDate(name, Number(level), true);
    });
  });
}

function setupSwipeNavigation() {
  let startX = 0;
  $("#room").addEventListener("touchstart", (event) => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });
  $("#room").addEventListener("touchend", (event) => {
    const distance = event.changedTouches[0].clientX - startX;
    if (Math.abs(distance) < 60) return;
    const current = CHARACTER_NAMES.indexOf(game.current);
    const next = distance < 0
      ? (current + 1) % CHARACTER_NAMES.length
      : (current - 1 + CHARACTER_NAMES.length) % CHARACTER_NAMES.length;
    switchCharacter(CHARACTER_NAMES[next]);
  }, { passive: true });
}

normalizeState();
renderRoom();
renderCharacterList();
setupSwipeNavigation();
updateBgmButton();
updateSfxButton();

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest?.("#bgm-button")) playBgm();
}, { once: true, passive: true });
document.addEventListener("keydown", playBgm, { once: true });
bgmButton.addEventListener("click", toggleBgm);
sfxButton.addEventListener("click", toggleSfx);

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest?.("button");
  if (!button || button.disabled || button.id === "sfx-button") return;
  if (button.matches("[data-character], [data-response]")) return;
  playSfx(button.matches("[data-topic], #talk-button") ? "select" : "click");
});

$("#memory-button").addEventListener("click", () => {
  renderMemory();
  $("#memory-overlay").classList.remove("hidden");
});
$("#close-memory").addEventListener("click", () => $("#memory-overlay").classList.add("hidden"));
$("#reset-button").addEventListener("click", () => {
  if (!confirm("確定要清除目前進度嗎？")) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});
