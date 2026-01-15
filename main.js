/* Bunno Boo — Vertical Slice (Top-down RPG)
   - Touch joystick (left side) + controller support
   - Tap enemy to attack, hold to charge
   - Scene system designed for easy expansion
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const UI = {
  hp: document.getElementById("hp"),
  hpMax: document.getElementById("hpMax"),
  atk: document.getElementById("atk"),
  rupees: document.getElementById("rupees"),
  sceneName: document.getElementById("sceneName"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayBody: document.getElementById("overlayBody"),
  overlayBtn: document.getElementById("overlayBtn"),
  interactBtn: document.getElementById("interactBtn"),
  toast: document.getElementById("toast"),
};

const joy = {
  area: document.getElementById("joy"),
  base: document.getElementById("joyBase"),
  stick: document.getElementById("joyStick"),
  active: false,
  id: null,
  baseX: 0, baseY: 0,
  x: 0, y: 0,
  dx: 0, dy: 0,
  max: 52, // stick travel
};

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }
function len(x, y) { return Math.hypot(x, y); }
function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

function resize() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// ---------- Game state ----------
const game = {
  time: 0,
  dt: 0,
  last: performance.now(),
  paused: false,
  camera: { x: 0, y: 0 },
  pointer: {
    active: false,
    id: null,
    x: 0, y: 0,
    downAt: 0,
    downX: 0, downY: 0,
    holding: false,
    holdTargetId: null,
  },
  toastTimer: 0,
};

// Player (Bunno Boo)
const player = {
  x: 200, y: 200,
  r: 16,
  vx: 0, vy: 0,
  speed: 175,
  hp: 50,
  hpMax: 50,
  atk: 1,
  rupees: 0,
  invuln: 0,
};

// Combat tuning
const combat = {
  baseDamage: 10,        // Lightning Jolt base damage
  chargeTime: 0.55,      // seconds to reach max charge
  maxChargeMult: 1.75,   // charged damage multiplier
  range: 240,
  castCooldown: 0.20,
  cooldown: 0,
};

// Simple effects
const fx = {
  bolts: [],   // lightning bolts (visual)
  pops: [],    // hit pops
  screenShake: 0,
};

// Entity store
let nextId = 1;
function makeId() { return nextId++; }

// Entities: enemies + chests
const world = {
  w: 1200,
  h: 800,
  entities: [],      // enemies + chests
  barriers: [],      // rectangles {x,y,w,h} for collision
  exits: [],         // scene exits {x,y,w,h,to}
  sceneScript: null, // custom per-scene logic
  name: "Peace Garden",
};

// ---------- Scene System ----------
/*
  Add new scenes by defining them in SCENES.
  Each scene provides:
    - name
    - size
    - spawn (player x/y)
    - entities (factory function)
    - barriers
    - exits
    - onEnter (optional)
*/
const SCENES = {
  PeaceGarden: {
    name: "Peace Garden",
    size: { w: 1200, h: 800 },
    spawn: { x: 220, y: 450 },
    entities: () => [],
    barriers: () => [],
    exits: () => [{ x: 1080, y: 300, w: 100, h: 200, to: "Cemetery" }],
    onEnter: () => {
      showOverlay(
        "Incoming Message",
        `The Evil Tom & Margaret:\n\n“We’ve got your beautiful world all a horror now, Bunny Boo! There’s nothing you can do to stop us from contaminating everything you love! Try as you may, we’ve already unleashed our evil spell upon the creatures of Boo Planet… It’s only a matter of time before we infect every last living thing!”\n\n(You feel your blue halo brighten with determination.)\n\nDestroy all evil!\nTap an enemy to attack it.\nHold to power up.\nUse the hot bar to change attack / inventory.`,
        () => {
          // resume play
        }
      );
      toast("Move with the left joystick. Head to the right to enter the cemetery.");
    },
  },

  Cemetery: {
    name: "Cemetery",
    size: { w: 1400, h: 900 },
    spawn: { x: 160, y: 520 },
    barriers: () => [
      // A few grave “blocks”
      { x: 450, y: 260, w: 90, h: 90 },
      { x: 560, y: 380, w: 90, h: 90 },
      { x: 680, y: 300, w: 90, h: 90 },
      { x: 820, y: 460, w: 90, h: 90 },
    ],
    entities: () => {
      const e = [];
      // Big spider
      e.push(makeEnemy("spider_big", 520, 560));
      // Medium spiders
      e.push(makeEnemy("spider_med", 740, 620));
      e.push(makeEnemy("spider_med", 900, 540));

      // Chests
      e.push(makeChest("atk", 640, 520));        // obvious white glowing chest: +1 attack
      e.push(makeChest("gem50", 980, 340));      // green gem 50
      e.push(makeChest("gem100", 1100, 720));    // blue gem 100
      return e;
    },
    exits: () => [{ x: 1290, y: 380, w: 90, h: 200, to: "Clearing" }],
    onEnter: () => {
      toast("Tap enemies to lightning jolt. Hold to charge a stronger jolt.");
    },
  },

  Clearing: {
    name: "Clearing",
    size: { w: 1600, h: 950 },
    spawn: { x: 160, y: 480 },
    barriers: () => [
      // river band (impassable)
      { x: 950, y: 0, w: 120, h: 650 },
      // mountains edges
      { x: 0, y: 0, w: 1600, h: 30 },
      { x: 0, y: 920, w: 1600, h: 30 },
    ],
    entities: () => {
      const e = [];
      // 3 medium spiders
      e.push(makeEnemy("spider_med", 520, 520));
      e.push(makeEnemy("spider_med", 640, 420));
      e.push(makeEnemy("spider_med", 720, 580));
      // crow in tree by the river
      e.push(makeEnemy("crow", 900, 260));
      return e;
    },
    exits: () => [{ x: 1500, y: 420, w: 90, h: 220, to: "Forest" }],
    onEnter: () => {
      toast("Defeat 3 spiders and the crow, then head right into the forest.");
    },
  },

  Forest: {
    name: "Forest",
    size: { w: 1200, h: 800 },
    spawn: { x: 120, y: 400 },
    entities: () => [],
    barriers: () => [],
    exits: () => [],
    onEnter: () => {
      showOverlay(
        "Forest",
        `The trees whisper as Bunny Boo floats into the forest...\n\n(Scene complete — next level can be added here easily.)`,
        () => {}
      );
    },
  },
};

function loadScene(key) {
  const s = SCENES[key];
  if (!s) throw new Error("Unknown scene: " + key);

  world.name = s.name;
  world.w = s.size.w;
  world.h = s.size.h;
  world.entities = s.entities();
  world.barriers = s.barriers();
  world.exits = s.exits();
  world.sceneScript = null;

  player.x = s.spawn.x;
  player.y = s.spawn.y;
  player.vx = 0;
  player.vy = 0;

  UI.sceneName.textContent = world.name;

  if (s.onEnter) s.onEnter();
}

// ---------- Entity factories ----------
function makeEnemy(kind, x, y) {
  const id = makeId();
  if (kind === "spider_big") {
    return {
      id, type: "enemy", kind,
      x, y, r: 18,
      hp: combat.baseDamage * 2,  // 2 lightning jolts
      maxHp: combat.baseDamage * 2,
      speed: 95,
      dmg: 20,
      aggro: 260,
      atkRange: 28,
      cooldown: 0,
      alive: true,
    };
  }
  if (kind === "spider_med") {
    return {
      id, type: "enemy", kind,
      x, y, r: 15,
      hp: combat.baseDamage * 1,  // 1 lightning jolt
      maxHp: combat.baseDamage * 1,
      speed: 115,
      dmg: 10,
      aggro: 260,
      atkRange: 26,
      cooldown: 0,
      alive: true,
    };
  }
  if (kind === "crow") {
    return {
      id, type: "enemy", kind,
      x, y, r: 14,
      hp: combat.baseDamage * 1,  // 1 lightning jolt
      maxHp: combat.baseDamage * 1,
      speed: 165,
      dmg: 25,
      aggro: 320,
      atkRange: 30,
      cooldown: 0,
      alive: true,
      swoopPhase: 0,
      swoopTimer: 0,
    };
  }
  throw new Error("Unknown enemy kind: " + kind);
}

function makeChest(kind, x, y) {
  const id = makeId();
  return {
    id, type: "chest", kind,
    x, y, r: 16,
    opened: false,
    glow: 0,
  };
}

// ---------- Overlay + Toast ----------
function showOverlay(title, body, onClose) {
  game.paused = true;
  UI.overlayTitle.textContent = title;
  UI.overlayBody.textContent = body;
  UI.overlay.classList.remove("hidden");
  UI.overlayBtn.onclick = () => {
    UI.overlay.classList.add("hidden");
    game.paused = false;
    onClose?.();
  };
}

function toast(msg, t = 2.5) {
  UI.toast.textContent = msg;
  UI.toast.classList.remove("hidden");
  game.toastTimer = t;
}

// ---------- Input ----------
function getCanvasPointFromClient(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (cx - rect.left),
    y: (cy - rect.top),
  };
}

function isLeftSide(clientX) {
  return clientX < window.innerWidth * 0.5;
}

// Touch joystick
function setJoyCenter(clientX, clientY) {
  // base anchored at fixed location (bottom-left), but we treat it as fixed for simplicity.
  const baseRect = joy.base.getBoundingClientRect();
  joy.baseX = baseRect.left + baseRect.width / 2;
  joy.baseY = baseRect.top + baseRect.height / 2;
  joy.x = joy.baseX;
  joy.y = joy.baseY;
  joy.dx = 0;
  joy.dy = 0;
  joy.stick.style.transform = `translate(35px,35px)`;
}

function updateJoy(clientX, clientY) {
  const dx = clientX - joy.baseX;
  const dy = clientY - joy.baseY;
  const l = Math.hypot(dx, dy);
  const m = l > joy.max ? joy.max / (l || 1) : 1;
  const ndx = dx * m;
  const ndy = dy * m;
  joy.dx = ndx / joy.max;
  joy.dy = ndy / joy.max;

  // move stick visually inside base
  const baseRect = joy.base.getBoundingClientRect();
  const ox = (baseRect.width - joy.stick.getBoundingClientRect().width) / 2;
  const oy = (baseRect.height - joy.stick.getBoundingClientRect().height) / 2;
  // translate relative to base element coords
  const tx = ox + ndx;
  const ty = oy + ndy;
  joy.stick.style.transform = `translate(${tx}px, ${ty}px)`;
}

function resetJoy() {
  joy.dx = 0; joy.dy = 0;
  joy.stick.style.transform = `translate(35px,35px)`;
}

function pointerDown(e) {
  if (game.paused) return;

  const isTouch = e.type.startsWith("touch");
  const touches = isTouch ? e.changedTouches : [e];

  for (const t of touches) {
    const clientX = t.clientX, clientY = t.clientY;

    // Left side => joystick
    if (!joy.active && isLeftSide(clientX)) {
      joy.active = true;
      joy.id = t.identifier ?? "mouse";
      setJoyCenter(clientX, clientY);
      updateJoy(clientX, clientY);
      continue;
    }

    // Right side => attack tap/hold
    if (!game.pointer.active) {
      game.pointer.active = true;
      game.pointer.id = t.identifier ?? "mouse";
      game.pointer.downAt = performance.now();
      game.pointer.downX = clientX;
      game.pointer.downY = clientY;

      const p = getCanvasPointFromClient(clientX, clientY);
      game.pointer.x = p.x;
      game.pointer.y = p.y;

      // pick a target if tapping near an enemy (in screen space)
      const target = pickEnemyAtScreen(p.x, p.y, 44);
      game.pointer.holdTargetId = target?.id ?? null;
      game.pointer.holding = false;
    }
  }
}

function pointerMove(e) {
  const isTouch = e.type.startsWith("touch");
  const touches = isTouch ? e.changedTouches : [e];

  for (const t of touches) {
    const clientX = t.clientX, clientY = t.clientY;

    if (joy.active && (t.identifier ?? "mouse") === joy.id) {
      updateJoy(clientX, clientY);
      continue;
    }

    if (game.pointer.active && (t.identifier ?? "mouse") === game.pointer.id) {
      const p = getCanvasPointFromClient(clientX, clientY);
      game.pointer.x = p.x;
      game.pointer.y = p.y;
    }
  }
}

function pointerUp(e) {
  const isTouch = e.type.startsWith("touch");
  const touches = isTouch ? e.changedTouches : [e];

  for (const t of touches) {
    const id = t.identifier ?? "mouse";

    if (joy.active && id === joy.id) {
      joy.active = false;
      joy.id = null;
      resetJoy();
      continue;
    }

    if (game.pointer.active && id === game.pointer.id) {
      // determine tap vs hold
      const now = performance.now();
      const heldMs = now - game.pointer.downAt;

      const targetId = game.pointer.holdTargetId;
      const target = targetId ? world.entities.find(en => en.id === targetId && en.type === "enemy" && en.alive) : null;

      if (target) {
        const charge = clamp(heldMs / (combat.chargeTime * 1000), 0, 1);
        castLightning(target, charge);
      }

      game.pointer.active = false;
      game.pointer.id = null;
      game.pointer.holding = false;
      game.pointer.holdTargetId = null;
    }
  }
}

// prevent scroll
const overlayEl = document.getElementById("overlay");

function shouldAllowNativeTouch(target) {
  // Allow taps/clicks on overlay UI and hotbar/buttons
  return (
    overlayEl && !overlayEl.classList.contains("hidden") ||
    target.closest("#hotbar") ||
    target.closest("#topbar") ||
    target.closest("#overlayCard") ||
    target.closest("button")
  );
}

function preventGameScroll(e) {
  if (shouldAllowNativeTouch(e.target)) return;
  e.preventDefault();
}

document.addEventListener("touchstart", preventGameScroll, { passive: false });
document.addEventListener("touchmove", preventGameScroll, { passive: false });
document.addEventListener("touchend", preventGameScroll, { passive: false });

window.addEventListener("mousedown", pointerDown);
window.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);

window.addEventListener("touchstart", pointerDown, { passive: false });
window.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp, { passive: false });
window.addEventListener("touchcancel", pointerUp, { passive: false });

// Interact button (chests)
UI.interactBtn.addEventListener("click", () => {
  const chest = nearestChestInRange(44);
  if (chest) openChest(chest);
});

// Hotbar (placeholder inventory)
document.getElementById("slotInv").addEventListener("click", () => {
  toast("Inventory is coming soon.");
});

// ---------- Controller (Gamepad API) ----------
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return { mx: 0, my: 0, cast: false, charge: false };

  // left stick
  const mx = gp.axes[0] || 0;
  const my = gp.axes[1] || 0;

  // A / Cross to attack
  const cast = gp.buttons[0]?.pressed || false;
  // Hold right trigger to "charge"
  const charge = gp.buttons[7]?.pressed || false;

  return { mx, my, cast, charge };
}

let gpWasCast = false;
let gpChargeStart = 0;

// ---------- Combat ----------
function pickEnemyAtScreen(sx, sy, radiusPx) {
  // Convert screen point to world point
  const wx = sx + game.camera.x;
  const wy = sy + game.camera.y;

  let best = null;
  let bestD = Infinity;

  for (const e of world.entities) {
    if (e.type !== "enemy" || !e.alive) continue;
    const d = dist2(wx, wy, e.x, e.y);
    const rr = (radiusPx + e.r) ** 2;
    if (d <= rr && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function castLightning(enemy, charge01) {
  if (game.paused) return;
  if (combat.cooldown > 0) return;

  // check range
  const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  if (d > combat.range) {
    toast("Too far!");
    return;
  }

  const mult = 1 + (combat.maxChargeMult - 1) * charge01;
  const dmg = Math.round(combat.baseDamage * player.atk * mult);

  enemy.hp -= dmg;
  fx.bolts.push({
    t: 0,
    dur: 0.12,
    x1: player.x, y1: player.y,
    x2: enemy.x, y2: enemy.y,
  });
  fx.pops.push({ t: 0, dur: 0.25, x: enemy.x, y: enemy.y, text: `-${dmg}` });
  fx.screenShake = Math.min(10, fx.screenShake + 5);

  combat.cooldown = combat.castCooldown;

  if (enemy.hp <= 0) {
    enemy.alive = false;
    fx.pops.push({ t: 0, dur: 0.6, x: enemy.x, y: enemy.y, text: `✦` });
  }
}

// ---------- Chests ----------
function nearestChestInRange(r) {
  let best = null;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.type !== "chest" || e.opened) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d <= r && d < bestD) {
      best = e; bestD = d;
    }
  }
  return best;
}

function openChest(chest) {
  if (chest.opened) return;
  chest.opened = true;

  if (chest.kind === "atk") {
    player.atk += 1;
    toast("Chest opened: Attack Power +1!");
  } else if (chest.kind === "gem50") {
    player.rupees += 50;
    toast("Found a green gem: +50 rupees!");
  } else if (chest.kind === "gem100") {
    player.rupees += 100;
    toast("Found a blue gem: +100 rupees!");
  } else {
    toast("Chest opened!");
  }
}

// ---------- Physics / Collision ----------
function collideCircleRect(cx, cy, r, rect) {
  const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
  const px = clamp(cx, rx, rx + rw);
  const py = clamp(cy, ry, ry + rh);
  const dx = cx - px;
  const dy = cy - py;
  return (dx*dx + dy*dy) < (r*r);
}

function resolvePlayerCollision(nx, ny) {
  // keep inside world
  nx = clamp(nx, player.r, world.w - player.r);
  ny = clamp(ny, player.r, world.h - player.r);

  // resolve against barriers (simple axis separation)
  for (const b of world.barriers) {
    if (collideCircleRect(nx, ny, player.r, b)) {
      // try separate x
      if (!collideCircleRect(player.x, ny, player.r, b)) {
        nx = player.x;
      } else if (!collideCircleRect(nx, player.y, player.r, b)) {
        ny = player.y;
      } else {
        // push out roughly
        nx = player.x;
        ny = player.y;
      }
    }
  }
  return { nx, ny };
}

// ---------- Enemy AI ----------
function updateEnemy(e, dt) {
  if (!e.alive) return;

  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy);

  e.cooldown = Math.max(0, e.cooldown - dt);

  const canAggro = d < e.aggro;

  if (e.kind === "crow") {
    // Crow: agile swoop — circles a bit then lunges toward player
    if (canAggro) {
      e.swoopTimer += dt;
      if (e.swoopTimer > 1.25) {
        e.swoopTimer = 0;
        e.swoopPhase = 1; // lunge
      }
    } else {
      e.swoopTimer = 0;
      e.swoopPhase = 0;
    }

    if (e.swoopPhase === 1 && canAggro) {
      const n = norm(dx, dy);
      e.x += n.x * e.speed * 1.35 * dt;
      e.y += n.y * e.speed * 1.35 * dt;
      if (d < e.atkRange && e.cooldown === 0) {
        damagePlayer(e.dmg);
        e.cooldown = 0.8;
        e.swoopPhase = 0;
      }
    } else if (canAggro) {
      // drift around player
      const n = norm(dx, dy);
      // slight sideways bias
      const sideX = -n.y * 0.4;
      const sideY = n.x * 0.4;
      e.x += (n.x + sideX) * e.speed * 0.55 * dt;
      e.y += (n.y + sideY) * e.speed * 0.55 * dt;

      if (d < e.atkRange && e.cooldown === 0) {
        damagePlayer(e.dmg);
        e.cooldown = 0.9;
      }
    }
    return;
  }

  // Spiders: chase + bite
  if (canAggro) {
    const n = norm(dx, dy);
    e.x += n.x * e.speed * dt;
    e.y += n.y * e.speed * dt;

    // Bite if close enough and off cooldown
    if (d < e.atkRange && e.cooldown === 0) {
      damagePlayer(e.dmg);
      e.cooldown = (e.kind === "spider_big") ? 0.9 : 0.75;
    }
  } else {
    // idle wiggle
    e.x += Math.sin((game.time + e.id) * 0.7) * 10 * dt;
    e.y += Math.cos((game.time + e.id) * 0.6) * 10 * dt;
  }
}

function damagePlayer(amount) {
  if (player.invuln > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invuln = 0.7;
  fx.screenShake = Math.min(14, fx.screenShake + 8);
  toast(`Ouch! -${amount} HP`, 1.2);
  if (player.hp <= 0) {
    showOverlay(
      "Bunny Boo fainted!",
      "The world wobbles... but you can try again.\n\n(Tip: keep distance and use charged jolts.)",
      () => {
        // restart current scene
        player.hp = player.hpMax;
        player.invuln = 0;
        loadScene(currentSceneKey);
      }
    );
  }
}

// ---------- Scene progression checks ----------
let currentSceneKey = "PeaceGarden";

function checkExits() {
  for (const ex of world.exits) {
    const inside =
      player.x > ex.x && player.x < ex.x + ex.w &&
      player.y > ex.y && player.y < ex.y + ex.h;

    if (inside) {
      // For Clearing, require all enemies dead before forest
      if (currentSceneKey === "Clearing" && ex.to === "Forest") {
        if (!allEnemiesDefeated()) {
          toast("Defeat all enemies before entering the forest.");
          return;
        }
      }
      currentSceneKey = ex.to;
      loadScene(currentSceneKey);
      return;
    }
  }
}

function allEnemiesDefeated() {
  return world.entities.every(e => e.type !== "enemy" || !e.alive);
}

// ---------- Rendering ----------
function drawBackground() {
  // simple per-scene palettes
  let bg = "#0b1220";
  if (currentSceneKey === "PeaceGarden") bg = "#0b1a14";
  if (currentSceneKey === "Cemetery") bg = "#121018";
  if (currentSceneKey === "Clearing") bg = "#0c1420";
  if (currentSceneKey === "Forest") bg = "#06130f";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // subtle grid for debugging / feel
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#ffffff";
  const step = 64;
  const startX = - (game.camera.x % step);
  const startY = - (game.camera.y % step);
  for (let x = startX; x < window.innerWidth; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, window.innerHeight); ctx.stroke();
  }
  for (let y = startY; y < window.innerHeight; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(window.innerWidth, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBarriers() {
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#ffffff";
  for (const b of world.barriers) {
    ctx.fillRect(b.x - game.camera.x, b.y - game.camera.y, b.w, b.h);
  }
  ctx.globalAlpha = 1;
}

function drawExits() {
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#7dd3fc";
  for (const ex of world.exits) {
    ctx.fillRect(ex.x - game.camera.x, ex.y - game.camera.y, ex.w, ex.h);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const sx = player.x - game.camera.x;
  const sy = player.y - game.camera.y;

  // Bunno Boo: capsule body
  ctx.save();

  // halo at base (blue)
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 14, 26, 12, 0, 0, TAU);
  ctx.fillStyle = "#60a5fa";
  ctx.fill();
  ctx.globalAlpha = 1;

  // hover shadow
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.ellipse(sx, sy + 18, 18, 8, 0, 0, TAU);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.globalAlpha = 1;

  // body capsule
  const w = 26, h = 34;
  roundCapsule(sx - w/2, sy - h/2, w, h, 13, player.invuln > 0 ? 0.75 : 1);

  // small ears hint
  ctx.globalAlpha = player.invuln > 0 ? 0.75 : 1;
  ctx.fillStyle = "#e9eefc";
  ctx.beginPath();
  ctx.roundRect(sx - 10, sy - 26, 6, 14, 6);
  ctx.roundRect(sx + 4, sy - 26, 6, 14, 6);
  ctx.fill();
  ctx.restore();
}

function roundCapsule(x, y, w, h, r, alpha=1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#e9eefc";
  ctx.strokeStyle = "rgba(125,211,252,0.35)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawEntities() {
  for (const e of world.entities) {
    if (e.type === "enemy") drawEnemy(e);
    if (e.type === "chest") drawChest(e);
  }
}

function drawEnemy(e) {
  if (!e.alive) return;
  const sx = e.x - game.camera.x;
  const sy = e.y - game.camera.y;

  // body
  if (e.kind.startsWith("spider")) {
    ctx.fillStyle = (e.kind === "spider_big") ? "rgba(251,113,133,0.9)" : "rgba(251,113,133,0.75)";
    ctx.beginPath();
    ctx.arc(sx, sy, e.r, 0, TAU);
    ctx.fill();

    // legs (simple)
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (i * 10), sy + 18);
      ctx.stroke();
    }
  } else if (e.kind === "crow") {
    ctx.fillStyle = "rgba(180,185,200,0.9)";
    ctx.beginPath();
    ctx.arc(sx, sy, e.r, 0, TAU);
    ctx.fill();

    // wings
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - 18, sy);
    ctx.quadraticCurveTo(sx, sy - 18, sx + 18, sy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // hp bar (tiny)
  const hp01 = clamp(e.hp / e.maxHp, 0, 1);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(sx - 18, sy - e.r - 14, 36, 6);
  ctx.fillStyle = "rgba(125,211,252,0.9)";
  ctx.fillRect(sx - 18, sy - e.r - 14, 36 * hp01, 6);
  ctx.globalAlpha = 1;
}

function drawChest(c) {
  const sx = c.x - game.camera.x;
  const sy = c.y - game.camera.y;

  // glow
  if (!c.opened) {
    ctx.globalAlpha = 0.18 + 0.12 * Math.sin(game.time * 4);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, sy, 24, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // chest box
  ctx.fillStyle = c.opened ? "rgba(170,179,197,0.55)" : "rgba(255,255,255,0.85)";
  ctx.strokeStyle = "rgba(125,211,252,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx - 14, sy - 10, 28, 22, 6);
  ctx.fill();
  ctx.stroke();

  // latch
  ctx.fillStyle = "rgba(6,16,24,0.55)";
  ctx.fillRect(sx - 3, sy - 2, 6, 6);
}

function drawEffects(dt) {
  // lightning bolts
  for (let i = fx.bolts.length - 1; i >= 0; i--) {
    const b = fx.bolts[i];
    b.t += dt;
    if (b.t >= b.dur) { fx.bolts.splice(i, 1); continue; }

    const a = 1 - (b.t / b.dur);
    ctx.globalAlpha = 0.9 * a;
    ctx.strokeStyle = "rgba(125,211,252,1)";
    ctx.lineWidth = 3;

    // jagged line
    const x1 = b.x1 - game.camera.x;
    const y1 = b.y1 - game.camera.y;
    const x2 = b.x2 - game.camera.x;
    const y2 = b.y2 - game.camera.y;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    const steps = 6;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const mx = x1 + (x2 - x1) * t;
      const my = y1 + (y2 - y1) * t;
      const jx = (Math.random() - 0.5) * 18;
      const jy = (Math.random() - 0.5) * 18;
      ctx.lineTo(mx + jx, my + jy);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // damage pops
  for (let i = fx.pops.length - 1; i >= 0; i--) {
    const p = fx.pops[i];
    p.t += dt;
    if (p.t >= p.dur) { fx.pops.splice(i, 1); continue; }

    const a = 1 - (p.t / p.dur);
    const y = (p.y - game.camera.y) - 12 - (p.t * 40);
    const x = (p.x - game.camera.x);
    ctx.globalAlpha = 0.9 * a;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.text, x, y);
    ctx.globalAlpha = 1;
  }
}

function applyCamera(dt) {
  // Follow player, clamp to world bounds
  const targetX = player.x - window.innerWidth / 2;
  const targetY = player.y - window.innerHeight / 2;

  // smooth follow
  const smooth = 1 - Math.pow(0.0001, dt); // frame-rate independent
  game.camera.x += (targetX - game.camera.x) * smooth;
  game.camera.y += (targetY - game.camera.y) * smooth;

  game.camera.x = clamp(game.camera.x, 0, Math.max(0, world.w - window.innerWidth));
  game.camera.y = clamp(game.camera.y, 0, Math.max(0, world.h - window.innerHeight));

  // screen shake
  if (fx.screenShake > 0) {
    const s = fx.screenShake;
    fx.screenShake = Math.max(0, fx.screenShake - 40 * dt);
    game.camera.x += (Math.random() - 0.5) * s;
    game.camera.y += (Math.random() - 0.5) * s;
  }
}

// ---------- Update loop ----------
function update(dt) {
  if (game.paused) return;

  // toast timer
  if (game.toastTimer > 0) {
    game.toastTimer -= dt;
    if (game.toastTimer <= 0) UI.toast.classList.add("hidden");
  }

  // invuln
  player.invuln = Math.max(0, player.invuln - dt);

  // cooldown
  combat.cooldown = Math.max(0, combat.cooldown - dt);

  // movement input (touch joystick + gamepad)
  const gp = readGamepad();
  let mx = joy.dx;
  let my = joy.dy;

  // mix with gamepad if present
  if (Math.abs(gp.mx) > 0.12 || Math.abs(gp.my) > 0.12) {
    mx = gp.mx;
    my = gp.my;
  }

  // normalize diagonal
  const mlen = Math.hypot(mx, my);
  if (mlen > 1) { mx /= mlen; my /= mlen; }

  player.vx = mx * player.speed;
  player.vy = my * player.speed;

  let nx = player.x + player.vx * dt;
  let ny = player.y + player.vy * dt;

  const res = resolvePlayerCollision(nx, ny);
  player.x = res.nx;
  player.y = res.ny;

  // enemy updates
  for (const e of world.entities) {
    if (e.type === "enemy") updateEnemy(e, dt);
  }

  // controller attack: target nearest enemy, tap A to cast, hold RT to charge
  const anyEnemy = nearestEnemyInRange(combat.range);
  if (anyEnemy) {
    if (gp.cast && !gpWasCast) {
      gpWasCast = true;
      gpChargeStart = performance.now();
    }
    if (!gp.cast && gpWasCast) {
      const heldMs = performance.now() - gpChargeStart;
      const charge = clamp(heldMs / (combat.chargeTime * 1000), 0, 1);
      castLightning(anyEnemy, gp.charge ? Math.max(charge, 0.5) : charge);
      gpWasCast = false;
    }
  } else {
    gpWasCast = false;
  }

  // interact prompt near chest
  const chest = nearestChestInRange(44);
  if (chest) UI.interactBtn.classList.remove("hidden");
  else UI.interactBtn.classList.add("hidden");

  // scene exits
  checkExits();

  // UI refresh
  UI.hp.textContent = player.hp.toString();
  UI.hpMax.textContent = player.hpMax.toString();
  UI.atk.textContent = player.atk.toString();
  UI.rupees.textContent = player.rupees.toString();
}

function nearestEnemyInRange(r) {
  let best = null;
  let bestD = Infinity;
  for (const e of world.entities) {
    if (e.type !== "enemy" || !e.alive) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d <= r && d < bestD) { best = e; bestD = d; }
  }
  return best;
}

function render(dt) {
  applyCamera(dt);

  drawBackground();

  // world boundaries (visual)
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-game.camera.x, -game.camera.y, world.w, world.h);
  ctx.globalAlpha = 1;

  drawBarriers();
  drawExits();
  drawEntities();
  drawPlayer();
  drawEffects(dt);

  // small hint arrow in PeaceGarden to cemetery entrance
  if (currentSceneKey === "PeaceGarden") {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(125,211,252,0.95)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("→ Cemetery", 1020 - game.camera.x, 290 - game.camera.y);
    ctx.globalAlpha = 1;
  }
}

// ---------- Main loop ----------
function loop(now) {
  const dt = Math.min(0.033, (now - game.last) / 1000);
  game.last = now;
  game.time += dt;

  update(dt);
  render(dt);

  requestAnimationFrame(loop);
}

// Start
loadScene(currentSceneKey);
requestAnimationFrame(loop);
