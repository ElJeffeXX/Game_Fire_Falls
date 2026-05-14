const mainDisplay = document.getElementById("gameCanvas");
const gameSize = gameCanvas.getBoundingClientRect();
const gameCtx = gameCanvas.getContext("2d");
gameCtx.imageSmoothingEnabled = false;

let gameStarted = false;
let gameOver = false;

// Round system
let currentRound = 1;
let totalEnemiesThisRound = 0;
let enemiesDefeated = 0;
let enemiesSpawnedThisRound = 0;
let roundActive = false;
let roundAnnouncementAlpha = 0;
let roundAnnouncementTimer = 0;
let betweenRounds = false;
let betweenRoundTimer = 0;
let roundConfig = null;
let spawnIntervalId = null;
let upgradeAnimationActive = false;
let upgradeOpen = false;
let rerollUsedThisRound = false;

// Particles and hit effects
let particles = [];
let hitEffects = [];

// ============================================================
//  AUDIO
// ============================================================

const sounds = {
  redFlame:    new Audio("Sounds/Red_Flame.wav"),
  greenFlame:  new Audio("Sounds/Green_Flame.wav"),
  purpleFlame: new Audio("Sounds/Purple_Flame.wav"),
  blueFlame:   new Audio("Sounds/Blue_Flame.wav"),
  blackFlame:  new Audio("Sounds/Black_Flame.wav"),
  flameKill:   new Audio("Sounds/Flame_Kill.wav"),
  levelUp:     new Audio("Sounds/Level_Up.wav"),
  upgradeCard: new Audio("Sounds/Upgrade_Card_Collect.wav"),
};

// Loop the flame ambient sounds
sounds.redFlame.loop    = true;
sounds.greenFlame.loop  = true;
sounds.purpleFlame.loop = true;
sounds.blueFlame.loop   = true;
sounds.blackFlame.loop  = true;

let currentFlameSound = null;

function getFlameSound(round) {
  if (round >= 100) return sounds.blackFlame;
  if (round >= 75)  return sounds.blueFlame;
  if (round >= 50)  return sounds.purpleFlame;
  if (round >= 25)  return sounds.greenFlame;
  return sounds.redFlame;
}

function updateFlameAmbience(round) {
  const next = getFlameSound(round);
  if (next === currentFlameSound) return;

// Stop flame ambience during upgrade screen
  if (currentFlameSound) {
    currentFlameSound.pause();
    currentFlameSound.currentTime = 0;
  }
  currentFlameSound = next;
  currentFlameSound.volume = 0.4;
  currentFlameSound.play().catch(() => {});
}

function playSound(sound, volume = 1.0) {
  const s = sound.cloneNode ? sound.cloneNode() : sound;
  s.volume = volume;
  s.play().catch(() => {});
}

const startScreen = document.getElementById("StartScreen");
const startBtn = document.getElementById("start-btn");
const howToPlayBtn = document.getElementById("howto-btn");
const howToPlayOverlay = document.getElementById("howto-overlay");
const howToPlayClose = document.getElementById("howto-close");

function setHowToTab(tabId) {
  document.querySelectorAll(".howto-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
  });
  document.querySelectorAll(".howto-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabId}`);
  });
}

startBtn.addEventListener("click", () => {
  startScreen.classList.add("fade-out");
  gameStarted = true;
  startRound(currentRound);
});

howToPlayBtn.addEventListener("click", () => {
  howToPlayOverlay.classList.add("visible");
  setHowToTab("controls");
});

howToPlayClose.addEventListener("click", () => {
  howToPlayOverlay.classList.remove("visible");
});

document.querySelectorAll(".howto-tab").forEach((button) => {
  button.addEventListener("click", () => {
    setHowToTab(button.dataset.tab);
  });
});

document.getElementById("gameover-restart").addEventListener("click", () => {
  location.reload();
});

let world = { health: 5 };

let player = {
  health: 5,
  x: gameCanvas.width / 2 - 78,
  y: gameCanvas.height * 2 / 3 - 78,
  dead: false,
  speed: 5,
  lastshot: 15,
  firerate: 10,
  direction: "idle",
  width: 156,
  height: 156,
  animationFrame: 0,
  dashing: false,
  dashDirection: null,
  dashDuration: 0,
  dashMaxDuration: 10,
  dashSpeed: 20,
  dashCooldown: 0,
  dashMaxCooldown: 15,
  streamDamage: 15,
  hitDamage: 3000,
  hitCooldown: 0,
};

let orb = {
  width: 50,
  height: 50,
  animationFrame: 0,
  energy: 1.0,
  radius: (1 / 2) * player.height,
};

let enemies = [];
let keys = [];
let keyPressTime = {};
const douplePressThreshold = 250;

let left = [], up = [], down = [], upRight = [], upLeft = [],
    downRight = [], downLeft = [], drips = [];

let beamActive = false;
let maxBeamRange = 300;

// ============================================================
//  PARTICLES & HIT EFFECTS
// ============================================================

function spawnHitParticles(x, y, count = 6) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: Math.random() * 0.06 + 0.04,
      size: Math.random() * 5 + 2,
      color: `hsl(${200 + Math.random() * 40}, 100%, ${50 + Math.random() * 30}%)`,
    });
  }
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: Math.random() * 0.03 + 0.02,
      size: Math.random() * 8 + 3,
      color: `hsl(${10 + Math.random() * 30}, 100%, ${40 + Math.random() * 30}%)`,
    });
  }
}

function spawnHitEffect(x, y, damage) {
  hitEffects.push({
    x, y,
    damage: Math.floor(damage),
    life: 1.0,
    decay: 0.025,
    vy: -1.2,
  });
}

function updateAndDrawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    gameCtx.save();
    gameCtx.globalAlpha = p.life;
    gameCtx.fillStyle = p.color;
    gameCtx.beginPath();
    gameCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    gameCtx.fill();
    gameCtx.restore();
  }
}

function updateAndDrawHitEffects() {
  for (let i = hitEffects.length - 1; i >= 0; i--) {
    const h = hitEffects[i];
    h.y += h.vy;
    h.life -= h.decay;
    if (h.life <= 0) { hitEffects.splice(i, 1); continue; }
    gameCtx.save();
    gameCtx.globalAlpha = h.life;
    gameCtx.textAlign = "center";
    gameCtx.font = `bold ${14 + Math.floor((1 - h.life) * 6)}px sans-serif`;
    gameCtx.strokeStyle = "#000000";
    gameCtx.lineWidth = 3;
    gameCtx.strokeText(`-${h.damage}`, h.x, h.y);
    gameCtx.fillStyle = "#ffffff";
    gameCtx.fillText(`-${h.damage}`, h.x, h.y);
    gameCtx.restore();
  }
}

function drawEnemyHealthBar(enemy) {
  const barW = enemy.width;
  const barH = 5;
  const barX = enemy.x;
  const barY = enemy.y - 10;
  const hpPercent = Math.max(0, enemy.health / enemy.maxHealth);

  gameCtx.fillStyle = "#333333";
  gameCtx.fillRect(barX, barY, barW, barH);

  const r = Math.floor(255 * (1 - hpPercent));
  const g = Math.floor(255 * hpPercent);
  gameCtx.fillStyle = `rgb(${r},${g},0)`;
  gameCtx.fillRect(barX, barY, barW * hpPercent, barH);

  gameCtx.strokeStyle = "#000000";
  gameCtx.lineWidth = 1;
  gameCtx.strokeRect(barX, barY, barW, barH);
}

// ============================================================
//  UPGRADE SYSTEM
// ============================================================

const UPGRADE_POOL = [
  {
    id: "dmg_rng",
    buff:   { label: "Damage +25%", emoji: "⚔️", key: "streamDamage", mult: 1.25 },
    debuff: { label: "Range -10%",  emoji: "🏹", key: "maxBeamRange",  mult: 0.90 },
    losesHp: false, title: "Bloodthirst",
    desc: "Strike harder — but your reach shortens.",
  },
  {
    id: "dmg_spd",
    buff:   { label: "Damage +25%", emoji: "⚔️", key: "streamDamage", mult: 1.25 },
    debuff: { label: "Speed -10%",  emoji: "👟", key: "speed",         mult: 0.90 },
    losesHp: false, title: "Heavy Handed",
    desc: "Power comes at the cost of footwork.",
  },
  {
    id: "dmg_dash",
    buff:   { label: "Damage +25%",  emoji: "⚔️", key: "streamDamage",    mult: 1.25 },
    debuff: { label: "Dash CD +40%", emoji: "⚡", key: "dashMaxCooldown", mult: 1.40 },
    losesHp: false, title: "Reckless Force",
    desc: "More power, fewer escapes.",
  },
  {
    id: "dmg_hp",
    buff:   { label: "Damage +60%", emoji: "⚔️", key: "streamDamage", mult: 1.60 },
    debuff: { label: "Lose 1 HP",   emoji: "❤️", key: "health",        delta: -1  },
    losesHp: true, title: "Blood Price",
    desc: "Sacrifice vitality for devastation.",
  },
  {
    id: "dmg_free",
    buff:   { label: "Damage +10%", emoji: "⚔️", key: "streamDamage", mult: 1.10 },
    debuff: null, losesHp: false, title: "Arcane Insight",
    desc: "Your knowledge of the arcane grants you a damage boost — no strings attached.",
  },
  {
    id: "rng_dmg",
    buff:   { label: "Range +30%",   emoji: "🏹", key: "maxBeamRange",  mult: 1.30 },
    debuff: { label: "Damage -10%",  emoji: "⚔️", key: "streamDamage",  mult: 0.90 },
    losesHp: false, title: "Long Reach",
    desc: "Extend your beam — but dilute its punch.",
  },
  {
    id: "rng_spd",
    buff:   { label: "Range +30%",  emoji: "🏹", key: "maxBeamRange", mult: 1.30 },
    debuff: { label: "Speed -10%",  emoji: "👟", key: "speed",        mult: 0.90 },
    losesHp: false, title: "Rooted Focus",
    desc: "A longer beam anchors your feet.",
  },
  {
    id: "rng_dash",
    buff:   { label: "Range +30%",   emoji: "🏹", key: "maxBeamRange",    mult: 1.30 },
    debuff: { label: "Dash CD +40%", emoji: "⚡", key: "dashMaxCooldown", mult: 1.40 },
    losesHp: false, title: "Committed Shot",
    desc: "Extended reach costs your agility.",
  },
  {
    id: "rng_hp",
    buff:   { label: "Range +60%", emoji: "🏹", key: "maxBeamRange", mult: 1.60 },
    debuff: { label: "Lose 1 HP",  emoji: "❤️", key: "health",        delta: -1  },
    losesHp: true, title: "Desperate Reach",
    desc: "Push the beam further at personal cost.",
  },
  {
    id: "rng_free",
    buff:   { label: "Range +15%", emoji: "🏹", key: "maxBeamRange", mult: 1.15 },
    debuff: null, losesHp: false, title: "Eagle Eye",
    desc: "Your keen sight allows you to strike from farther away — no strings attached.",
  },
  {
    id: "spd_dmg",
    buff:   { label: "Speed +25%",  emoji: "👟", key: "speed",        mult: 1.25 },
    debuff: { label: "Damage -10%", emoji: "⚔️", key: "streamDamage", mult: 0.90 },
    losesHp: false, title: "Hit & Run",
    desc: "Move faster, hit lighter.",
  },
  {
    id: "spd_rng",
    buff:   { label: "Speed +25%", emoji: "👟", key: "speed",        mult: 1.25 },
    debuff: { label: "Range -10%", emoji: "🏹", key: "maxBeamRange", mult: 0.90 },
    losesHp: false, title: "Swift Step",
    desc: "Nimble feet, shorter reach.",
  },
  {
    id: "spd_dash",
    buff:   { label: "Speed +25%",   emoji: "👟", key: "speed",           mult: 1.25 },
    debuff: { label: "Dash CD +40%", emoji: "⚡", key: "dashMaxCooldown", mult: 1.40 },
    losesHp: false, title: "Blur",
    desc: "Fast on your feet, slow to blink.",
  },
  {
    id: "spd_hp",
    buff:   { label: "Speed +50%", emoji: "👟", key: "speed",  mult: 1.50 },
    debuff: { label: "Lose 1 HP",  emoji: "❤️", key: "health", delta: -1  },
    losesHp: true, title: "Adrenaline Rush",
    desc: "Burn through vitality for pure speed.",
  },
  {
    id: "spd_free",
    buff:   { label: "Speed +10%", emoji: "👟", key: "speed", mult: 1.10 },
    debuff: null, losesHp: false, title: "Fleet Footed",
    desc: "Your quick reflexes grant you a speed boost — no strings attached.",
  },
  {
    id: "dash_dmg",
    buff:   { label: "Dash CD -30%", emoji: "⚡", key: "dashMaxCooldown", mult: 0.70 },
    debuff: { label: "Damage -10%",  emoji: "⚔️", key: "streamDamage",    mult: 0.90 },
    losesHp: false, title: "Slippery",
    desc: "Escape more often — strike softer.",
  },
  {
    id: "dash_rng",
    buff:   { label: "Dash CD -30%", emoji: "⚡", key: "dashMaxCooldown", mult: 0.70 },
    debuff: { label: "Range -10%",   emoji: "🏹", key: "maxBeamRange",    mult: 0.90 },
    losesHp: false, title: "Evasive",
    desc: "Slip away faster, aim up close.",
  },
  {
    id: "dash_spd",
    buff:   { label: "Dash CD -30%", emoji: "⚡", key: "dashMaxCooldown", mult: 0.70 },
    debuff: { label: "Speed -10%",   emoji: "👟", key: "speed",           mult: 0.90 },
    losesHp: false, title: "Burst",
    desc: "Short bursts, slower stroll.",
  },
  {
    id: "dash_hp",
    buff:   { label: "Dash CD -60%", emoji: "⚡", key: "dashMaxCooldown", mult: 0.40 },
    debuff: { label: "Lose 1 HP",    emoji: "❤️", key: "health",          delta: -1  },
    losesHp: true, title: "Reckless Dodge",
    desc: "Dash more often — but you're more fragile.",
  },
  {
    id: "dash_free",
    buff:   { label: "Dash CD -15%", emoji: "⚡", key: "dashMaxCooldown", mult: 0.85 },
    debuff: null, losesHp: false, title: "Quick Reflexes",
    desc: "Your sharp instincts let you recover faster — no strings attached.",
  },
  {
    id: "hp_dmg",
    buff:   { label: "Gain 1 HP",   emoji: "❤️", key: "health",       delta: +1  },
    debuff: { label: "Damage -5%",  emoji: "⚔️", key: "streamDamage", mult: 0.95 },
    losesHp: false, title: "Fortified",
    desc: "Extra life, softer strikes.",
  },
  {
    id: "hp_rng",
    buff:   { label: "Gain 1 HP",  emoji: "❤️", key: "health",       delta: +1  },
    debuff: { label: "Range -5%",  emoji: "🏹", key: "maxBeamRange", mult: 0.95 },
    losesHp: false, title: "Resilient",
    desc: "More life, shorter beam.",
  },
  {
    id: "hp_spd",
    buff:   { label: "Gain 1 HP",  emoji: "❤️", key: "health", delta: +1  },
    debuff: { label: "Speed -5%",  emoji: "👟", key: "speed",  mult: 0.95 },
    losesHp: false, title: "Tanky",
    desc: "Bulkier — but slower to boot.",
  },
  {
    id: "hp_dash",
    buff:   { label: "Gain 1 HP",    emoji: "❤️", key: "health",          delta: +1  },
    debuff: { label: "Dash CD +40%", emoji: "⚡", key: "dashMaxCooldown", mult: 1.40 },
    losesHp: false, title: "Armoured",
    desc: "Tougher hide — sluggish blink.",
  },
  {
    id: "hp_free",
    buff:   { label: "Gain 1 HP", emoji: "❤️", key: "health", delta: +1 },
    debuff: null, losesHp: false, title: "Blessing",
    desc: "The world heals you — no strings attached.",
  },
];

function pickUpgrades(playerHp) {
  const pool = [...UPGRADE_POOL];
  const chosen = [];
  let hpLossCount = 0;
  while (chosen.length < 3 && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    const card = pool[idx];
    pool.splice(idx, 1);
    if (card.losesHp) {
      if (hpLossCount >= 2) continue;
      if (playerHp <= 1) continue;
      hpLossCount++;
    }
    chosen.push(card);
  }
  return chosen;
}

function applyUpgrade(card) {
  const b = card.buff;
  if (b.delta !== undefined) {
    if (b.key === "health") {
      player[b.key] = Math.min(5, Math.max(1, (player[b.key] || 0) + b.delta));
      world[b.key]  = Math.min(5, Math.max(0, (world[b.key]  || 0) + b.delta));
    } else {
      player[b.key] = Math.max(1, (player[b.key] || 0) + b.delta);
    }
  } else if (b.mult !== undefined) {
    if (b.key === "maxBeamRange") maxBeamRange = parseFloat((maxBeamRange * b.mult).toFixed(1));
    else player[b.key] = parseFloat(((player[b.key] || 1) * b.mult).toFixed(3));
  }
  if (card.debuff) {
    const d = card.debuff;
    if (d.delta !== undefined) {
      player[d.key] = Math.max(1, (player[d.key] || 0) + d.delta);
    } else if (d.mult !== undefined) {
      if (d.key === "maxBeamRange") maxBeamRange = parseFloat((maxBeamRange * d.mult).toFixed(1));
      else player[d.key] = parseFloat(((player[d.key] || 1) * d.mult).toFixed(3));
    }
  }
}

function initUpgradeSystem() {
  if (!document.getElementById("upgrade-font-link")) {
    const link = document.createElement("link");
    link.id = "upgrade-font-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap";
    document.head.appendChild(link);
  }

  const overlay = document.createElement("div");
  overlay.id = "upgrade-overlay";
  overlay.innerHTML = `
    <div id="upgrade-bg"></div>
    <div id="upgrade-panel">
      <p id="upgrade-round-label"></p>
      <h2 id="upgrade-heading">Choose an Upgrade</h2>
      <div id="upgrade-cards"></div>
      <div id="upgrade-actions">
        <button id="upgrade-reroll">Reroll (1/round)</button>
        <button id="upgrade-skip">Skip</button>
      </div>
      <div id="upgrade-stats">
        <div class="upgrade-stat-entry"><span class="stat-label">HP</span><span class="stat-value" id="upgrade-stat-health"></span></div>
        <div class="upgrade-stat-entry"><span class="stat-label">Damage</span><span class="stat-value" id="upgrade-stat-damage"></span></div>
        <div class="upgrade-stat-entry"><span class="stat-label">Range</span><span class="stat-value" id="upgrade-stat-range"></span></div>
        <div class="upgrade-stat-entry"><span class="stat-label">Speed</span><span class="stat-value" id="upgrade-stat-speed"></span></div>
        <div class="upgrade-stat-entry"><span class="stat-label">Dash CD</span><span class="stat-value" id="upgrade-stat-dash"></span></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const s = document.createElement("style");
  s.textContent = `
    #upgrade-overlay {
      display: none; position: fixed; inset: 0; z-index: 9999;
      align-items: center; justify-content: center; pointer-events: none;
    }
    #upgrade-overlay.visible { display: flex; }
    #upgrade-bg {
      position: absolute; inset: 0;
      background: rgba(10, 6, 2, 0.82); pointer-events: none;
    }
    #upgrade-panel {
      position: relative; z-index: 1; display: flex; flex-direction: column;
      align-items: center; gap: 18px; padding: 32px 24px 28px;
      max-width: 820px; width: 95vw;
    }
    #upgrade-round-label {
      font-family: 'Cinzel', serif; font-size: 13px; letter-spacing: 0.18em;
      color: #b89a6a; text-transform: uppercase; margin: 0;
    }
    #upgrade-heading {
      font-family: 'Cinzel', serif; font-size: 26px; font-weight: 700;
      color: #f5e6c8; margin: 0; letter-spacing: 0.04em;
    }
    #upgrade-cards {
      display: flex; gap: 18px; flex-wrap: wrap;
      justify-content: center; align-items: flex-start;
    }
    #upgrade-stats {
      width: 100%; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px; padding: 18px 8px 0;
      border-top: 1px solid rgba(245,230,200,0.18); margin-top: 8px;
    }
    .upgrade-stat-entry {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; border-radius: 8px; background: rgba(255,255,255,0.05);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
      font-family: 'Lora', serif; font-size: 14px; color: #f5e6c8; letter-spacing: 0.01em;
    }
    .upgrade-stat-entry .stat-label { opacity: 0.85; }
    .upgrade-stat-entry .stat-value { font-weight: 700; color: #ffffff; }
    #upgrade-panel, .upg-card, #upgrade-skip, #upgrade-reroll { pointer-events: auto; }
    .upg-card {
      width: 260px; min-height: 340px; position: relative; cursor: pointer;
      user-select: none; display: flex; flex-direction: column; align-items: center;
      padding: 28px 20px 24px; box-sizing: border-box;
      transition: transform 0.15s ease, filter 0.15s ease, opacity 0.25s ease;
      border-radius: 8px; overflow: hidden; opacity: 0;
      transform: translateX(-32px) scale(0.97);
      animation: upgrade-card-in 0.32s ease forwards;
    }
    .upg-card:hover { transform: translateY(-6px) scale(1.03); filter: brightness(1.12); cursor: url("Sprites/cursor3.png"), auto; }
    .upg-card:active { transform: translateY(-2px) scale(1.01); }
    .upg-card.card-fade-out { opacity: 0; transform: translateY(-20px) scale(0.85); }
    .upg-card.card-selected { animation: card-selected 0.5s ease forwards; }
    .upg-card.card-skip-away { animation: card-skip-away 0.45s ease forwards; }
    @keyframes upgrade-card-in { to { opacity: 1; transform: translateX(0) scale(1); } }
    @keyframes card-selected {
      0%   { opacity: 1; transform: scale(1) rotate(0deg); }
      50%  { opacity: 1; transform: scale(1.25) rotate(180deg); }
      100% { opacity: 0; transform: scale(1.5) rotate(360deg); }
    }
    @keyframes card-skip-away { to { opacity: 0; transform: translateX(120vw) scale(0.8); } }
    .upg-card-bg {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; pointer-events: none; z-index: 0; image-rendering: pixelated;
    }
    .upg-card-inner {
      position: relative; z-index: 1; display: flex; flex-direction: column;
      align-items: center; width: 100%; height: 100%;
    }
    .upg-card-icon { font-size: 46px; line-height: 1; margin-bottom: 10px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
    .upg-card-title {
      font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700;
      color: #f2e2b0; text-align: center; margin-bottom: 8px;
      text-shadow: 0 1px 3px #000; letter-spacing: 0.04em;
    }
    .upg-card-desc {
      font-family: 'Lora', serif; font-size: 14px; color: #d4c49a;
      text-align: center; font-style: italic; margin-bottom: 16px;
      line-height: 1.5; text-shadow: 0 1px 2px #000;
      width: 100%; overflow-wrap: break-word; word-break: break-word; white-space: normal;
    }
    .upg-stat {
      display: flex; align-items: center; gap: 8px;
      font-family: 'Lora', serif; font-size: 14px; font-weight: 600;
      margin-bottom: 8px; text-shadow: 0 1px 3px #000;
    }
    .upg-stat.buff  { color: #8ef5a0; }
    .upg-stat.debuff { color: #f5a0a0; }
    .upg-stat-icon { font-size: 16px; line-height: 1; }
    .upg-no-symbol {
      display: inline-flex; align-items: center; justify-content: center;
      position: relative; font-size: 16px; line-height: 1;
    }
    .upg-no-symbol::after {
      content: ""; position: absolute; width: 18px; height: 18px;
      border: 2.5px solid #f5a0a0; border-radius: 50%;
      top: 50%; left: 50%; transform: translate(-50%, -50%);
    }
    .upg-no-symbol::before {
      content: ""; position: absolute; width: 2.5px; height: 22px;
      background: #f5a0a0; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(45deg); border-radius: 2px;
    }
    #upgrade-skip, #upgrade-reroll {
      margin-top: 8px; font-family: 'Cinzel', serif; font-size: 13px;
      letter-spacing: 0.12em; color: #9a8060; background: transparent;
      border: 1.5px solid #5a4020; border-radius: 4px; padding: 8px 32px;
      cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    #upgrade-skip:hover, #upgrade-reroll:hover:not(:disabled) {
      color: #f5e6c8; border-color: #b89a6a; background: rgba(100,70,20,0.1);
    }
    #upgrade-reroll:disabled { opacity: 0.45; cursor: not-allowed; border-color: #4a3015; }
  `;
  document.head.appendChild(s);

  document.getElementById("upgrade-skip").addEventListener("click", animateSkipUpgrade);
  document.getElementById("upgrade-reroll").addEventListener("click", handleReroll);
}

function handleReroll() {
  if (rerollUsedThisRound) return;
  rerollUsedThisRound = true;
  document.getElementById("upgrade-reroll").disabled = true;
  const container = document.getElementById("upgrade-cards");
  container.innerHTML = "";
  const cards = pickUpgrades(player.health);
  cards.forEach((upgrade, index) => {
    const cardEl = buildUpgradeCard(upgrade);
    cardEl.style.animationDelay = `${index * 0.12}s`;
    cardEl.addEventListener("click", () => animateUpgradeChoice(cardEl, upgrade));
    container.appendChild(cardEl);
  });
}

function animateUpgradeChoice(cardEl, upgrade) {
  if (upgradeAnimationActive) return;
  upgradeAnimationActive = true;
  playSound(sounds.upgradeCard, 0.8);
  const container = document.getElementById("upgrade-cards");
  Array.from(container.children).forEach((card) => {
    if (card !== cardEl) card.classList.add("card-fade-out");
  });
  cardEl.classList.add("card-selected");
  setTimeout(() => {
    applyUpgrade(upgrade);
    hideUpgradeScreen();
    upgradeAnimationActive = false;
  }, 520);
}

function animateSkipUpgrade() {
  if (upgradeAnimationActive) return;
  upgradeAnimationActive = true;
  const container = document.getElementById("upgrade-cards");
  Array.from(container.children).forEach((card, index) => {
    card.style.animationDelay = `${index * 0.05}s`;
    card.classList.add("card-skip-away");
  });
  setTimeout(() => {
    hideUpgradeScreen();
    upgradeAnimationActive = false;
  }, 500);
}

function buildUpgradeCard(upgrade) {
  const card = document.createElement("div");
  card.className = "upg-card";

  const bg = document.createElement("img");
  bg.className = "upg-card-bg";
  bg.src = "Sprites/Upgrade/slab.png";
  bg.alt = "";
  card.appendChild(bg);

  const inner = document.createElement("div");
  inner.className = "upg-card-inner";

  const icon = document.createElement("div");
  icon.className = "upg-card-icon";
  icon.textContent = upgrade.buff.emoji;
  inner.appendChild(icon);

  const title = document.createElement("div");
  title.className = "upg-card-title";
  title.textContent = upgrade.title;
  inner.appendChild(title);

  const desc = document.createElement("div");
  desc.className = "upg-card-desc";
  desc.textContent = upgrade.desc;
  inner.appendChild(desc);

  const buffRow = document.createElement("div");
  buffRow.className = "upg-stat buff";
  buffRow.innerHTML = `<span class="upg-stat-icon">${upgrade.buff.emoji}</span> ${upgrade.buff.label}`;
  inner.appendChild(buffRow);

  if (upgrade.debuff) {
    const debuffRow = document.createElement("div");
    debuffRow.className = "upg-stat debuff";
    const noSym = document.createElement("span");
    noSym.className = "upg-no-symbol";
    noSym.textContent = upgrade.debuff.emoji;
    debuffRow.appendChild(noSym);
    const labelSpan = document.createElement("span");
    labelSpan.textContent = " " + upgrade.debuff.label;
    debuffRow.appendChild(labelSpan);
    inner.appendChild(debuffRow);
  } else {
    const freeRow = document.createElement("div");
    freeRow.className = "upg-stat buff";
    freeRow.style.opacity = "0.7";
    freeRow.textContent = "✨ No drawback";
    inner.appendChild(freeRow);
  }

  card.appendChild(inner);
  return card;
}

function showUpgradeScreen() {
  const overlay = document.getElementById("upgrade-overlay");
  if (!overlay) return;

  // Stop flame ambience during upgrade screen
  if (currentFlameSound) {
    currentFlameSound.pause();
    currentFlameSound.currentTime = 0;
    currentFlameSound = null; // clear so updateFlameAmbience restarts it fresh
  }


  playSound(sounds.levelUp, 0.9);

  upgradeOpen = true;
  keys = [];
  player.direction = "idle";
  beamActive = false;
  mouse.down = false;

  const rerollBtn = document.getElementById("upgrade-reroll");
  if (rerollBtn) rerollBtn.disabled = false;

  const roundLabel = document.getElementById("upgrade-round-label");
  if (roundLabel) roundLabel.textContent = `Round ${currentRound} complete`;

  const container = document.getElementById("upgrade-cards");
  container.innerHTML = "";

  const cards = pickUpgrades(player.health);
  cards.forEach((upgrade, index) => {
    const cardEl = buildUpgradeCard(upgrade);
    cardEl.style.animationDelay = `${index * 0.12}s`;
    cardEl.addEventListener("click", () => animateUpgradeChoice(cardEl, upgrade));
    container.appendChild(cardEl);
  });

  updateUpgradeStats();
  overlay.classList.add("visible");
}

function updateUpgradeStats() {
  const healthEl = document.getElementById("upgrade-stat-health");
  const damageEl = document.getElementById("upgrade-stat-damage");
  const rangeEl  = document.getElementById("upgrade-stat-range");
  const speedEl  = document.getElementById("upgrade-stat-speed");
  const dashEl   = document.getElementById("upgrade-stat-dash");
  if (healthEl) healthEl.textContent = `${player.health}`;
  if (damageEl) damageEl.textContent = `${player.streamDamage}`;
  if (rangeEl)  rangeEl.textContent  = `${maxBeamRange}`;
  if (speedEl)  speedEl.textContent  = `${player.speed.toFixed(1)}`;
  if (dashEl)   dashEl.textContent   = `${player.dashMaxCooldown.toFixed(1)}s`;
}

function hideUpgradeScreen() {
  const overlay = document.getElementById("upgrade-overlay");
  if (overlay) overlay.classList.remove("visible");
  upgradeOpen = false;
  currentRound++;
  startRound(currentRound);
}

// ============================================================
//  ROUND SYSTEM
// ============================================================

function getRoundMultiplier(round) {
  return Math.pow(1.4, Math.floor(round / 30));
}

function getRoundConfig(round) {
  const r = round - 1;
  const multiplier = getRoundMultiplier(round);
  const minEnemies = Math.floor(5 + r * 0.95);
  const maxEnemies = Math.floor(10 + r * 1.2);
  const baseTotal  = Math.floor(Math.random() * (maxEnemies - minEnemies + 1)) + minEnemies;
  const total      = Math.max(1, Math.floor(baseTotal * multiplier));
  const maxOnScreen = Math.min(2 + Math.floor(r * 0.18), 12);
  const minHp = Math.max(1, Math.floor((50 + r * 8) * multiplier));
  const maxHp = Math.max(minHp, Math.floor((65 + r * 9) * multiplier));
  const spawnInterval = Math.max(1500 - r * 80, 600);
  return { total, maxOnScreen, minHp, maxHp, minSpeed: 1, maxSpeed: 3, spawnInterval };
}

function startRound(round) {
  rerollUsedThisRound = false;
  roundConfig = getRoundConfig(round);
  totalEnemiesThisRound = roundConfig.total;
  enemiesDefeated = 0;
  enemiesSpawnedThisRound = 0;
  enemies = [];
  roundActive = true;
  betweenRounds = false;
  roundAnnouncementAlpha = 1.0;
  roundAnnouncementTimer = 180;

  // Start the correct flame ambience for this round
  updateFlameAmbience(round);

  if (spawnIntervalId) clearInterval(spawnIntervalId);
  spawnIntervalId = setInterval(() => {
    if (gameOver || !roundActive ||
        enemiesSpawnedThisRound >= totalEnemiesThisRound ||
        enemies.length >= roundConfig.maxOnScreen) return;
    spawnRoundEnemy();
  }, roundConfig.spawnInterval);
}

function getEnemyTypeForRound(round) {
  if (round >= 100) return "grey";
  if (round >= 75)  return "blue";
  if (round >= 50)  return "purple";
  if (round >= 25)  return "green";
  return "red";
}

function spawnRoundEnemy() {
  const cfg = roundConfig;
  const hp    = Math.floor(Math.random() * (cfg.maxHp - cfg.minHp + 1)) + cfg.minHp;
  const speed = parseFloat((Math.random() * (cfg.maxSpeed - cfg.minSpeed) + cfg.minSpeed).toFixed(2));
  enemies.push({
    x: Math.random() * (gameCanvas.width - 100) + 50,
    y: -256, speed, health: hp, maxHealth: hp,
    width: 75, height: 75, animationFrame: 0, animationCounter: 0,
    hitCooldown: 0, hitCooldown2: 0,
    type: getEnemyTypeForRound(currentRound),
  });
  enemiesSpawnedThisRound++;
}

function checkRoundComplete() {
  if (roundActive && !gameOver && !player.dead &&
      enemiesSpawnedThisRound >= totalEnemiesThisRound &&
      enemies.length === 0) {
    roundActive = false;
    betweenRounds = false;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    showUpgradeScreen();
  }
}

// ============================================================
//  INPUT
// ============================================================

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (!gameStarted && (key === "enter" || key === " ")) {
    gameStarted = true;
    startScreen.classList.add("fade-out");
    startRound(currentRound);
  }
  if (upgradeOpen) return;
  keys[key] = true;
  const cardinalKeys = ["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"];
  if (gameStarted && cardinalKeys.includes(key) && !e.repeat && !player.dashing && player.dashCooldown <= 0) {
    const now = Date.now();
    if (keyPressTime[key] && now - keyPressTime[key] < douplePressThreshold) {
      player.dashing = true;
      player.dashDirection = key;
      player.dashDuration = player.dashMaxDuration;
      keyPressTime[key] = 0;
    } else {
      keyPressTime[key] = now;
    }
  }
});

document.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (upgradeOpen) return;
  keys[key] = false;
  player.direction = "idle";
});

document.addEventListener("mousedown", () => {
  if (upgradeOpen) return;
  mouse.down = true;
  beamActive = true;
});
document.addEventListener("mouseup", () => {
  if (upgradeOpen) return;
  mouse.down = false;
  beamActive = false;
});

const mouse = { x: 0, y: 0, down: false };

// ============================================================
//  SPRITES
// ============================================================

const flowerImg = new Image();
flowerImg.src = "Sprites/flowerT.png";
flowerImg.onload = function () { drawGame(); };

let rightSheet     = new Image(); rightSheet.src     = "Sprites/right/right.png";
let leftSheet      = new Image(); leftSheet.src      = "Sprites/left/left.png";
let upSheet        = new Image(); upSheet.src        = "Sprites/up/up.png";
let downSheet      = new Image(); downSheet.src      = "Sprites/down/down.png";
let upRightSheet   = new Image(); upRightSheet.src   = "Sprites/upRight/upRight.png";
let upLeftSheet    = new Image(); upLeftSheet.src    = "Sprites/upLeft/upLeft.png";
let downRightSheet = new Image(); downRightSheet.src = "Sprites/downRight/downRight.png";
let downLeftSheet  = new Image(); downLeftSheet.src  = "Sprites/downLeft/downLeft.png";
let idleSheet      = new Image(); idleSheet.src      = "Sprites/idle/idle.png";
let orbFullSheet   = new Image(); orbFullSheet.src   = "Sprites/orb/full.png";
let splashImg      = new Image(); splashImg.src      = "Sprites/splash/splash.png";
let dripSheet      = new Image(); dripSheet.src      = "Sprites/drip/drip.png";
let redFireSheet   = new Image(); redFireSheet.src   = "Sprites/fire/fireRed.png";
let greenFireSheet = new Image(); greenFireSheet.src = "Sprites/fire/fireGreen.png";
let purpleFireSheet= new Image(); purpleFireSheet.src= "Sprites/fire/firePurple.png";
let blueFireSheet  = new Image(); blueFireSheet.src  = "Sprites/fire/fireBlue.png";
let greyFireSheet  = new Image(); greyFireSheet.src  = "Sprites/fire/fireGrey.png";
let flowerHpSheet  = new Image(); flowerHpSheet.src  = "Sprites/Health/FlowerHp.png";
let worldHpSheet   = new Image(); worldHpSheet.src   = "Sprites/Health/WorldHp.png";

let frameCounts = {
  right: 4, left: 4, up: 4, down: 4,
  upRight: 4, upLeft: 4, downRight: 4, downLeft: 4,
  idle: 10, orbFull: 15,
  fireRed: 10, fireBlue: 10, firePurple: 10,
  fireGreen: 10, fireBlack: 10, fireWhite: 10, health: 6,
};

const hpBarScale = 0.7;
let frameWidth = 254, frameHeight = 254;

document.addEventListener("mousemove", (e) => {
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = gameCanvas.width / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  mouse.x = (e.clientX - rect.left) * scaleX;
  mouse.y = (e.clientY - rect.top)  * scaleY;
});

let lastOrbAngle = 0;

// ============================================================
//  GAME LOGIC HELPERS
// ============================================================

function getOrbPosition() {
  if (player.dead) return {};
  let playerCenterX = player.x + player.width / 2;
  let playerCenterY = player.y + player.width / 2;
  lastOrbAngle = Math.atan2(mouse.y - playerCenterY, mouse.x - playerCenterX);
  return {
    x: playerCenterX + Math.cos(lastOrbAngle) * (orb.radius + player.width * 0.2),
    y: playerCenterY + Math.sin(lastOrbAngle) * (orb.radius + player.width * 0.2),
  };
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const A = px-x1, B = py-y1, C = x2-x1, D = y2-y1;
  const dot = A*C + B*D, lenSq = C*C + D*D;
  let t = Math.max(0, Math.min(1, dot / lenSq));
  return Math.hypot(px - (x1 + t*C), py - (y1 + t*D));
}

function checkGameOver() {
  if ((player.health <= 0 || world.health <= 0) && !gameOver) {
    gameOver = true;
    player.dead = true;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    if (currentFlameSound) { currentFlameSound.pause(); currentFlameSound.currentTime = 0; }
  }
}

// ============================================================
//  DRAW FUNCTIONS
// ============================================================

function drawGameOver() {
  const overlay = document.getElementById("gameover-overlay");
  const titleEl = document.getElementById("gameover-title");
  const msgEl   = document.getElementById("gameover-message");
  const roundEl = document.getElementById("gameover-round");
  if (titleEl) titleEl.textContent = "GAME OVER";
  if (msgEl)   msgEl.textContent   = world.health <= 0 ? "The world was destroyed." : "You were defeated.";
  if (roundEl) roundEl.textContent = `You reached Round ${currentRound}`;
  if (overlay) overlay.classList.add("visible");
}

function drawRoundAnnouncement() {
  if (roundAnnouncementTimer <= 0) return;
  roundAnnouncementAlpha = roundAnnouncementTimer > 150 ? 1.0 : roundAnnouncementTimer / 150;
  gameCtx.save();
  gameCtx.globalAlpha = roundAnnouncementAlpha;
  gameCtx.textAlign = "center";
  gameCtx.fillStyle = "rgba(0,0,0,0.4)";
  gameCtx.font = "bold 82px serif";
  gameCtx.fillText(`Round ${currentRound}`, gameCanvas.width / 2 + 3, gameCanvas.height / 2 + 3);
  gameCtx.fillStyle = "#ffffff";
  gameCtx.font = "bold 80px serif";
  gameCtx.fillText(`Round ${currentRound}`, gameCanvas.width / 2, gameCanvas.height / 2);
  gameCtx.restore();
  roundAnnouncementTimer--;
}

function drawRoundHUD() {
  const padding = 14;
  gameCtx.save();
  gameCtx.textAlign = "right";
  gameCtx.font = "bold 20px sans-serif";
  gameCtx.fillStyle = "#ffffff";
  gameCtx.shadowColor = "rgba(0,0,0,0.8)";
  gameCtx.shadowBlur = 4;
  gameCtx.fillText(`Round ${currentRound}`, gameCanvas.width - padding, padding + 20);
  gameCtx.font = "16px sans-serif";
  gameCtx.fillText(`${enemiesDefeated} / ${totalEnemiesThisRound} defeated`, gameCanvas.width - padding, padding + 42);
  gameCtx.restore();
}

function drawHealthBars() {
  const totalFrames = 6, baseX = 10;
  if (flowerHpSheet.complete && flowerHpSheet.naturalHeight !== 0) {
    let frameW = flowerHpSheet.width / totalFrames, frameH = flowerHpSheet.height;
    let frame = 5 - Math.max(0, Math.min(5, player.health));
    let y = gameCanvas.height - frameH * hpBarScale - 5;
    gameCtx.drawImage(flowerHpSheet, frame * frameW, 0, frameW, frameH, baseX, y, frameW * hpBarScale, frameH * hpBarScale);
  }
  if (worldHpSheet.complete && worldHpSheet.naturalHeight !== 0) {
    let frameW = worldHpSheet.width / totalFrames, frameH = worldHpSheet.height;
    let frame = 5 - Math.max(0, Math.min(5, world.health));
    let y = gameCanvas.height - frameH * hpBarScale * 2 - 5;
    gameCtx.drawImage(worldHpSheet, frame * frameW, 0, frameW, frameH, baseX, y, frameW * hpBarScale, frameH * hpBarScale);
  }
}

function drawGame() {
  gameCtx.clearRect(-5, -5, gameCanvas.width + 10, gameCanvas.height + 10);

  // Draw drips
  for (let i = drips.length - 1; i >= 0; i--) {
    if (dripSheet.complete && dripSheet.naturalHeight !== 0) {
      let numFrames = dripSheet.width / dripSheet.height;
      let frameW = dripSheet.height;
      drips[i].frameCounter++;
      drips[i].frame = Math.floor(drips[i].frameCounter / 5);
      gameCtx.drawImage(dripSheet, drips[i].frame * frameW, 0, frameW, frameW,
        drips[i].x - frameW / 2, drips[i].y - 100, frameW, frameW);
      if (drips[i].frame >= numFrames) drips.splice(i, 1);
    }
  }

  // Draw player
  let sheet = null;
  if      (player.direction === "right"     && rightSheet.complete     && rightSheet.naturalHeight !== 0)     sheet = rightSheet;
  else if (player.direction === "left"      && leftSheet.complete      && leftSheet.naturalHeight !== 0)      sheet = leftSheet;
  else if (player.direction === "up"        && upSheet.complete        && upSheet.naturalHeight !== 0)        sheet = upSheet;
  else if (player.direction === "down"      && downSheet.complete      && downSheet.naturalHeight !== 0)      sheet = downSheet;
  else if (player.direction === "upRight"   && upRightSheet.complete   && upRightSheet.naturalHeight !== 0)   sheet = upRightSheet;
  else if (player.direction === "upLeft"    && upLeftSheet.complete    && upLeftSheet.naturalHeight !== 0)    sheet = upLeftSheet;
  else if (player.direction === "downRight" && downRightSheet.complete && downRightSheet.naturalHeight !== 0) sheet = downRightSheet;
  else if (player.direction === "downLeft"  && downLeftSheet.complete  && downLeftSheet.naturalHeight !== 0)  sheet = downLeftSheet;
  else if (player.direction === "idle"      && idleSheet.complete      && idleSheet.naturalHeight !== 0)      sheet = idleSheet;

  if (sheet) {
    let numFrames = frameCounts[player.direction] || 4;
    let frame = player.animationFrame % numFrames;
    gameCtx.drawImage(sheet, frame * frameWidth, 0, frameWidth, frameHeight,
      player.x, player.y, player.width, player.height);
  } else {
    gameCtx.drawImage(flowerImg, player.x, player.y);
  }

  // Draw orb
let { x: orbX, y: orbY } = getOrbPosition();
  if (orbX === undefined || orbY === undefined) { orbX = -999; orbY = -999; }
  if (orbFullSheet && orbFullSheet.complete && orbFullSheet.naturalHeight !== 0) {
    let numFrames = frameCounts.orbFull || 15;
    let orbFrameWidth  = orbFullSheet.width / numFrames;
    let orbFrameHeight = orbFullSheet.height;
    let frame = orb.animationFrame % numFrames;
    gameCtx.drawImage(orbFullSheet, frame * orbFrameWidth, 0, orbFrameWidth, orbFrameHeight,
      orbX - orbFrameWidth / 2, orbY - orbFrameHeight / 2, orbFrameWidth, orbFrameHeight);
  } else {
    gameCtx.fillStyle = "#FF0000";
    gameCtx.beginPath();
    gameCtx.arc(orbX, orbY, orb.width / 2, 0, Math.PI * 2);
    gameCtx.fill();
  }

  // Draw enemies + health bars
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    let frame = enemy.animationFrame % 10;
    let fireSheet = null;
    if      (enemy.type === "red")    fireSheet = redFireSheet;
    else if (enemy.type === "green")  fireSheet = greenFireSheet;
    else if (enemy.type === "purple") fireSheet = purpleFireSheet;
    else if (enemy.type === "blue")   fireSheet = blueFireSheet;
    else if (enemy.type === "grey")   fireSheet = greyFireSheet;

    if (fireSheet && fireSheet.complete && enemy.health > 0) {
      gameCtx.drawImage(fireSheet, frame * 254, 0, 254, 254,
        enemy.x, enemy.y, enemy.width, enemy.height);
      drawEnemyHealthBar(enemy);
    }
  }

  // Particles and hit effects (drawn before beam so beam renders on top)
  updateAndDrawParticles();
  updateAndDrawHitEffects();

  // Draw beam
  if (beamActive && mouse.down && !player.dead && !gameOver) {
    let { x: orbX, y: orbY } = getOrbPosition();
    let dx = mouse.x - orbX;
    let dy = mouse.y - orbY;
    let distance = Math.hypot(dx, dy);
    let dirX = dx / Math.max(distance, 0.0001);
    let dirY = dy / Math.max(distance, 0.0001);
    let beamLength = Math.min(distance, maxBeamRange);
    let endX = orbX + dirX * beamLength;
    let endY = orbY + dirY * beamLength;
    let beamThickness = 12;

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      let enemyX = enemy.x + enemy.width / 2;
      let enemyY = enemy.y + enemy.height / 2;

      let dist = pointToSegmentDistance(enemyX, enemyY, orbX, orbY, endX, endY);
      if (dist < beamThickness + 5 && enemy.hitCooldown <= 0) {
        enemy.health -= player.streamDamage;
        enemy.hitCooldown = 5;
        spawnHitParticles(enemyX, enemyY, 4);
        spawnHitEffect(enemyX, enemy.y, player.streamDamage);
      }

      let endDist = Math.hypot(endX - enemyX, endY - enemyY);
      if (endDist < 10 && enemy.hitCooldown2 <= 0) {
        enemy.health -= player.hitDamage;
        enemy.hitCooldown2 = 5;
      }

      if (enemy.health <= 0) {
        spawnDeathParticles(enemyX, enemyY);
        playSound(sounds.flameKill, 0.7);
        enemies.splice(i, 1);
        enemiesDefeated++;
      }
    }

    gameCtx.drawImage(splashImg, endX - 75, endY - 75, 150, 150);

    let angle = Math.atan2(endY - orbY, endX - orbX);
    let length = Math.hypot(endX - orbX, endY - orbY);
    gameCtx.save();
    gameCtx.translate(orbX, orbY);
    gameCtx.rotate(angle);
    const grad = gameCtx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, "#1117d6");
    grad.addColorStop(1, "#128ad9");
    gameCtx.fillStyle = grad;
    gameCtx.fillRect(0, -4, length, 8);
    gameCtx.fillRect(0, -1, length, 2);
    gameCtx.restore();
  }

  drawHealthBars();

  if (player.dashCooldown > 0) {
    let barWidth = 200, barHeight = 8;
    let barX = (gameCanvas.width - barWidth) / 2;
    let barY = gameCanvas.height - 20;
    let cooldownPercent = 1 - player.dashCooldown / player.dashMaxCooldown;
    gameCtx.fillStyle = "#333333";
    gameCtx.fillRect(barX, barY, barWidth, barHeight);
    gameCtx.fillStyle = "#00FF00";
    gameCtx.fillRect(barX, barY, barWidth * cooldownPercent, barHeight);
    gameCtx.strokeStyle = "#FFFFFF";
    gameCtx.lineWidth = 1;
    gameCtx.strokeRect(barX, barY, barWidth, barHeight);
  }

  drawRoundHUD();
  drawRoundAnnouncement();

  checkGameOver();
  if (gameOver) {
    drawGameOver();
  } else {
    checkRoundComplete();
  }
}

// ============================================================
//  MOVEMENT & ANIMATION LOOPS
// ============================================================

function playerMovement() {
  if (player.dashCooldown > 0) player.dashCooldown--;
  if (player.hitCooldown > 0)  player.hitCooldown--;

  if (upgradeOpen) { requestAnimationFrame(playerMovement); return; }

  if (player.dashing) {
    const d = player.dashSpeed;
    if      (player.dashDirection === "w" || player.dashDirection === "arrowup")    player.y -= d;
    else if (player.dashDirection === "s" || player.dashDirection === "arrowdown")  player.y += d;
    else if (player.dashDirection === "a" || player.dashDirection === "arrowleft")  player.x -= d;
    else if (player.dashDirection === "d" || player.dashDirection === "arrowright") player.x += d;
    player.dashDuration--;
    if (player.dashDuration <= 0) {
      player.dashing = false;
      player.dashDirection = null;
      player.dashCooldown = player.dashMaxCooldown;
    }
  }

  if (player.dead == false) {
    if (keys["w"] && !keys["d"] && !keys["a"] && !keys["s"]) { player.y -= player.speed; player.direction = "up"; }
    if (keys["a"] && !keys["s"] && !keys["w"] && !keys["d"]) { player.x -= player.speed; player.direction = "left"; }
    if (keys["s"] && !keys["d"] && !keys["a"] && !keys["w"]) { player.y += player.speed; player.direction = "down"; }
    if (keys["d"] && !keys["w"] && !keys["s"] && !keys["a"]) { player.x += player.speed; player.direction = "right"; }
    if (keys["w"] && keys["d"]) { player.x += (player.speed/3)*2.5; player.y -= (player.speed/3)*2.5; player.direction = "upRight"; }
    if (keys["a"] && keys["w"]) { player.x -= (player.speed/3)*2.5; player.y -= (player.speed/3)*2.5; player.direction = "upLeft"; }
    if (keys["s"] && keys["a"]) { player.x -= (player.speed/3)*2.5; player.y += (player.speed/3)*2.5; player.direction = "downLeft"; }
    if (keys["d"] && keys["s"]) { player.x += (player.speed/3)*2.5; player.y += (player.speed/3)*2.5; player.direction = "downRight"; }
    if (keys["a"] && keys["d"]) { player.direction = "idle"; }
    if (keys["w"] && keys["s"]) { player.direction = "idle"; }
    if (keys["a"] && keys["d"] && keys["w"]) { player.direction = "up"; }
    if (keys["a"] && keys["d"] && keys["s"]) { player.direction = "down"; }
    if (keys["w"] && keys["s"] && keys["a"]) { player.direction = "left"; }
    if (keys["w"] && keys["s"] && keys["d"]) { player.direction = "right"; }
    if (keys["arrowup"]    && !keys["arrowright"] && !keys["arrowleft"]  && !keys["arrowdown"])  { player.y -= player.speed; player.direction = "up"; }
    if (keys["arrowleft"]  && !keys["arrowdown"]  && !keys["arrowup"])                           { player.x -= player.speed; player.direction = "left"; }
    if (keys["arrowdown"]  && !keys["arrowright"]  && !keys["arrowleft"] && !keys["arrowup"])    { player.y += player.speed; player.direction = "down"; }
    if (keys["arrowright"] && !keys["arrowup"]     && !keys["arrowdown"] && !keys["arrowleft"])  { player.x += player.speed; player.direction = "right"; }
    if (keys["arrowup"]   && keys["arrowright"]) { player.x += (player.speed/3)*2.5; player.y -= (player.speed/3)*2.5; player.direction = "upRight"; }
    if (keys["arrowleft"] && keys["arrowup"])    { player.x -= (player.speed/3)*2.5; player.y -= (player.speed/3)*2.5; player.direction = "upLeft"; }
    if (keys["arrowdown"] && keys["arrowleft"])  { player.x -= (player.speed/3)*2.5; player.y += (player.speed/3)*2.5; player.direction = "downLeft"; }
    if (keys["arrowright"]&& keys["arrowdown"])  { player.x += (player.speed/3)*2.5; player.y += (player.speed/3)*2.5; player.direction = "downRight"; }
    if (keys["arrowleft"] && keys["arrowright"]) { player.direction = "idle"; }
    if (keys["arrowup"]   && keys["arrowdown"])  { player.direction = "idle"; }
    if (keys["arrowleft"] && keys["arrowright"] && keys["arrowup"])   { player.direction = "up"; }
    if (keys["arrowleft"] && keys["arrowright"] && keys["arrowdown"]) { player.direction = "down"; }
    if (keys["arrowup"]   && keys["arrowdown"]  && keys["arrowleft"]) { player.direction = "left"; }
    if (keys["arrowup"]   && keys["arrowdown"]  && keys["arrowright"]){ player.direction = "right"; }
  }

  if (!gameStarted) { requestAnimationFrame(playerMovement); return; }
  col("player", "wall");
  col("player", "enemy");
  drawGame();
  requestAnimationFrame(playerMovement);
}

function movementAnimation() {
  let animationCounter = 0, lastDirection = player.direction;
  function animateStep() {
    if (player.direction !== lastDirection) { animationCounter = 0; lastDirection = player.direction; }
    player.animationFrame = animationCounter % 10;
    orb.animationFrame    = animationCounter % 10;
    for (let i = 0; i < enemies.length; i++) {
      enemies[i].animationCounter++;
      enemies[i].animationFrame = enemies[i].animationCounter % 10;
    }
    animationCounter++;
    setTimeout(animateStep, 100);
  }
  animateStep();
}

function spawnDrip() {
  if (!gameStarted) { requestAnimationFrame(spawnDrip); return; }
  if (Math.random() < 1 / 250) {
    let { x: orbX, y: orbY } = getOrbPosition();
    if (orbX !== undefined) drips.push({ x: orbX, y: orbY, frame: 0, frameCounter: 0 });
  }
  requestAnimationFrame(spawnDrip);
}

function enemyMovement() {
  if (!gameOver) {
    for (let i = 0; i < enemies.length; i++) {
      enemies[i].y += enemies[i].speed;
      if (enemies[i].hitCooldown  > 0) enemies[i].hitCooldown--;
      if (enemies[i].hitCooldown2 > 0) enemies[i].hitCooldown2--;
    }
    col("fireR", "floor");
  }
  requestAnimationFrame(enemyMovement);
}

// ============================================================
//  COLLISION
// ============================================================

function col(entity, colType) {
  if (entity == "player") {
    if (colType == "wall") {
      if (player.x < 0 - player.width * 0.2) player.x = 0 - player.width * 0.2;
      if (player.y < 0 - player.width * 0.2) player.y = 0 - player.width * 0.2;
      if (player.x + player.width * 0.8 > gameCanvas.width)  player.x = gameCanvas.width  - player.width * 0.8;
      if (player.y + player.height       > gameCanvas.height) player.y = gameCanvas.height - player.height;
    }
    if (colType == "enemy") {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        let px = player.x + player.width * 0.2, py = player.y + player.height * 0.2;
        let pw = player.width * 0.6,             ph = player.height * 0.8;
        let hitting = px < enemy.x + enemy.width && px + pw > enemy.x &&
                      py < enemy.y + enemy.height && py + ph > enemy.y;
        if (hitting && player.hitCooldown <= 0) {
          player.health -= 1;
          player.hitCooldown = 60;
          if (player.health <= 0) player.dead = true;
        }
      }
    }
  }
  if (entity == "fireR" && colType == "floor") {
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].y >= gameCanvas.height) {
        world.health -= 1;
        enemiesDefeated++;
        enemies.splice(i, 1);
      }
    }
  }
}

// ============================================================
//  BOOT
// ============================================================

initUpgradeSystem();
drawGame();
movementAnimation();
requestAnimationFrame(playerMovement);
requestAnimationFrame(spawnDrip);
requestAnimationFrame(enemyMovement);