/* Bunno Boo — Vertical Slice (Top-down RPG)
   - Touch joystick (left side) + controller support
   - Tap enemy to attack, hold to charge
   - Scene system designed for easy expansion
   - Added: decor layers, atmospheric fog, depth sorting, aesthetic silhouettes
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
  baseX: 0,
  baseY: 0,
  dx: 0,
  dy: 0,
  max: 52,
};

const TAU = Math.PI * 2;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
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
  last: performance.now(),
  paused: false,
  camera: { x: 0, y: 0 },
  pointer: {
    active: false,
    id: null,
    x: 0,
    y: 0,
    downAt: 0,
    downX: 0,
    downY: 0,
    holdTargetId: null,
  },
  toastTimer: 0,
};

// Player (Bunno Boo)
const player = {
  x: 200,
  y: 200,
  r: 16,
  vx: 0,
  vy: 0,
  speed: 175,
  hp: 50,
  hpMax: 50,
  atk: 1,
  rupees: 0,
  invuln: 0,
};

// Combat tuning
const combat = {
  baseDamage: 10,
  chargeTime: 0.55,
  maxChargeMult: 1.75,
  range: 240,
  castCooldown: 0.20,
  cooldown: 0,
};

// Effects
const fx = {
  bolts: [],
  pops: [],
  screenShake: 0,
};

// Entity store
let nextId = 1;
function makeId() { return nextId++; }

// World
const world = {
  w: 1200,
  h: 800,
  entities: [],
  barriers: [],
  exits: [],
  name: "Peace Garden",
  decor: { ground: [], objects: [], canopy: [] },
};

// ---------- Decor system ----------
function makeDecor() {
  return { ground: [], objects: [], canopy: [] };
}
function w2s(x, y) { return { x: x - game.camera.x, y: y - game.camera.y }; }

// ---------- Scene System ----------
const SCENES = {
  PeaceGarden: {
    name: "Peace Garden",
    size: { w: 1200, h: 800 },
    spawn: { x: 260, y: 460 },
    entities: () => [],
    barriers: () => [],
    exits: () => [{ x: 1080, y: 300, w: 100, h: 220, to: "Cemetery" }],
    decor: () => {
      const d = makeDecor();

      // circular garden: ring of lush grass + flowers
      const cx = 560, cy = 420;
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU;
        const r = 250 + (Math.random() * 18 - 9);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.72;
        d.ground.push({ kind: "grassTuft", x, y, scale: 0.85 + Math.random() * 0.6 });
        if (i % 2 === 0) d.ground.push({ kind: "flowerPatch", x: x + Math.random() * 18 - 9, y: y + Math.random() * 18 - 9, r: 18 });
      }

      // center flower bed
      d.ground.push({ kind: "centerBed", x: cx, y: cy, r: 96 });

      // sprinkle more tufts
      for (let i = 0; i < 26; i++) {
        d.ground.push({ kind: "grassTuft", x: 120 + Math.random() * 930, y: 150 + Math.random() * 560, scale: 0.55 + Math.random() * 0.7 });
        if (i % 4 === 0) d.ground.push({ kind: "flowerPatch", x: 140 + Math.random() * 900, y: 170 + Math.random() * 520, r: 16 });
      }

      // a few trees near edges (trunk as object, canopy above)
      const trees = [[220, 220], [980, 240], [240, 690], [980, 690]];
      for (const [x, y] of trees) {
        const sc = 1.0 + Math.random() * 0.2;
        d.objects.push({ kind: "tree_trunk", x, y, scale: sc });
        d.canopy.push({ kind: "tree_canopy", x, y, scale: sc });
      }

      return d;
    },
    onEnter: () => {
      showOverlay(
        "Incoming Message",
        `The Evil Tom & Margaret:\n\n“We’ve got your beautiful world all a horror now, Bunny Boo! There’s nothing you can do to stop us from contaminating everything you love! Try as you may, we’ve already unleashed our evil spell upon the creatures of Boo Planet… It’s only a matter of time before we infect every last living thing!”\n\n(You feel your blue halo brighten with determination.)\n\nDestroy all evil!\nTap an enemy to attack it.\nHold to power up.\nUse the hot bar to change attack / inventory.`,
        () => { }
      );
      toast("Move with the left joystick. Head right to enter the cemetery.");
    },
  },

  Cemetery: {
    name: "Cemetery",
    size: { w: 1400, h: 900 },
    spawn: { x: 160, y: 560 },
    barriers: () => [
      { x: 450, y: 260, w: 90, h: 90 },
      { x: 560, y: 380, w: 90, h: 90 },
      { x: 680, y: 300, w: 90, h: 90 },
      { x: 820, y: 460, w: 90, h: 90 },
    ],
    entities: () => {
      const e = [];
      e.push(makeEnemy("spider_big", 520, 560));
      e.push(makeEnemy("spider_med", 740, 620));
      e.push(makeEnemy("spider_med", 900, 540));
      e.push(makeChest("atk", 640, 520));
      e.push(makeChest("gem50", 980, 340));
      e.push(makeChest("gem100", 1100, 720));
      return e;
    },
    exits: () => [{ x: 1290, y: 380, w: 90, h: 240, to: "Clearing" }],
    decor: () => {
      const d = makeDecor();

      // fences overlay
      d.canopy.push({ kind: "fence", x: 720, y: 220, w: 720 });
      d.canopy.push({ kind: "fence", x: 720, y: 790, w: 720 });

      // gravestones as depth-sorted objects
      const graves = [
        [520, 420], [600, 500], [700, 440], [820, 360], [980, 520],
        [1050, 420], [920, 680], [760, 720], [1120, 580], [640, 660]
      ];
      for (const [x, y] of graves) {
        d.objects.push({ kind: "grave", x, y, scale: 1.0 + Math.random() * 0.2 });
        d.ground.push({ kind: "grassTuft", x: x + Math.random() * 14 - 7, y: y + 34, scale: 0.45 + Math.random() * 0.35 });
      }

      // extra tufts
      for (let i = 0; i < 26; i++) {
        d.ground.push({ kind: "grassTuft", x: 140 + Math.random() * 1120, y: 160 + Math.random() * 640, scale: 0.45 + Math.random() * 0.55 });
      }
      return d;
    },
    onEnter: () => toast("Tap enemies to lightning jolt. Hold to charge a stronger jolt."),
  },

  Clearing: {
    name: "Clearing",
    size: { w: 1600, h: 950 },
    spawn: { x: 160, y: 520 },
    barriers: () => [
      { x: 950, y: 0, w: 120, h: 650 },
      { x: 0, y: 0, w: 1600, h: 30 },
      { x: 0, y: 920, w: 1600, h: 30 },
    ],
    entities: () => {
      const e = [];
      e.push(makeEnemy("spider_med", 520, 520));
      e.push(makeEnemy("spider_med", 640, 420));
      e.push(makeEnemy("spider_med", 720, 580));
      e.push(makeEnemy("crow", 900, 260));
      return e;
    },
    exits: () => [{ x: 1500, y: 420, w: 90, h: 250, to: "Forest" }],
    decor: () => {
      const d = makeDecor();

      // blue river
      d.ground.push({ kind: "river", x: 980, y: 40, w: 90, h: 600 });

      // oak by river
      d.objects.push({ kind: "oak_trunk", x: 900, y: 260, scale: 1.25 });
      d.canopy.push({ kind: "oak_canopy", x: 900, y: 260, scale: 1.25 });

      // rocks near river
      for (let i = 0; i < 12; i++) {
        d.objects.push({ kind: "rock", x: 860 + Math.random() * 140, y: 120 + Math.random() * 520, r: 12 + Math.random() * 14 });
      }

      // a handful of trees
      const trees = [[380, 220], [520, 320], [620, 180], [700, 360], [420, 660], [640, 740]];
      for (const [x, y] of trees) {
        const sc = 0.9 + Math.random() * 0.35;
        d.objects.push({ kind: "tree_trunk", x, y, scale: sc });
        d.canopy.push({ kind: "tree_canopy", x, y, scale: sc });
        d.ground.push({ kind: "grassTuft", x: x + Math.random() * 24 - 12, y: y + 56, scale: 0.6 });
      }

      // grass tufts everywhere
      for (let i = 0; i < 34; i++) {
        d.ground.push({ kind: "grassTuft", x: 120 + Math.random() * 1300, y: 120 + Math.random() * 720, scale: 0.55 + Math.random() * 0.8 });
      }

      return d;
    },
    onEnter: () => toast("Defeat 3 spiders and the crow, then head right into the forest."),
  },

  Forest: {
    name: "Forest",
    size: { w: 1200, h: 800 },
    spawn: { x: 140, y: 420 },
    entities: () => [],
    barriers: () => [],
    exits: () => [],
    decor: () => {
      const d = makeDecor();
      for (let i = 0; i < 34; i++) {
        d.ground.push({ kind: "grassTuft", x: 80 + Math.random() * 1040, y: 120 + Math.random() * 560, scale: 0.55 + Math.random() * 0.8 });
      }
      const trees = [[220, 220], [340, 300], [460, 200], [760, 240], [920, 340], [240, 640], [880, 650]];
      for (const [x, y] of trees) {
        const sc = 1.0 + Math.random() * 0.25;
        d.objects.push({ kind: "tree_trunk", x, y, scale: sc });
        d.canopy.push({ kind: "tree_canopy", x, y, scale: sc });
      }
      return d;
    },
    onEnter: () => {
      showOverlay(
        "Forest",
        `The trees whisper as Bunny Boo floats into the forest...\n\n(Scene complete — next level can be added here easily.)`,
        () => { }
      );
    },
  },
};

let currentSceneKey = "PeaceGarden";

function loadScene(key) {
  const s = SCENES[key];
  if (!s) throw new Error("Unknown scene: " + key);

  world.name = s.name;
  world.w = s.size.w;
  world.h = s.size.h;
  world.entities = s.entities();
  world.barriers = s.barriers();
  world.exits = s.exits();
  world.decor = s.decor ? s.decor() : makeDecor();

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
    return { id, type: "enemy", kind, x, y, r: 18, hp: combat.baseDamage * 2, maxHp: combat.baseDamage * 2, speed: 95, dmg: 20, aggro: 260, atkRange: 28, cooldown: 0, alive: true };
  }
  if (kind === "spider_med") {
    return { id, type: "enemy", kind, x, y, r: 15, hp: combat.baseDamage * 1, maxHp: combat.baseDamage * 1, speed: 115, dmg: 10, aggro: 260, atkRange: 26, cooldown: 0, alive: true };
  }
  if (kind === "crow") {
    return { id, type: "enemy", kind, x, y, r: 14, hp: combat.baseDamage * 1, maxHp: combat.baseDamage * 1, speed: 165, dmg: 25, aggro: 320, atkRange: 30, cooldown: 0, alive: true, swoopPhase: 0, swoopTimer: 0 };
  }
  throw new Error("Unknown enemy kind: " + kind);
}

function makeChest(kind, x, y) {
  const id = makeId();
  return { id, type: "chest", kind, x, y, r: 16, opened: false };
}

// ---------- Overlay + Toast (iOS-safe) ----------
function wireOverlayContinue(onClose) {
  const handler = (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    UI.overlay.classList.add("hidden");
    game.paused = false;
    onClose?.();
  };

  UI.overlayBtn.onclick = null;
  UI.overlayBtn.onpointerup = null;
  UI.overlayBtn.ontouchend = null;

  UI.overlayBtn.addEventListener("pointerup", handler, { once: true });
  UI.overlayBtn.addEventListener("touchend", handler, { once: true, passive: false });
  UI.overlayBtn.addEventListener("click", handler, { once: true });
}

function showOverlay(title, body, onClose) {
  game.paused = true;
  UI.overlayTitle.textContent = title;
  UI.overlayBody.textContent = body;
  UI.overlay.classList.remove("hidden");
  wireOverlayContinue(onClose);
}

function toast(msg, t = 2.5) {
  UI.toast.textContent = msg;
  UI.toast.classList.remove("hidden");
  game.toastTimer = t;
}

// ---------- Input ----------
function getCanvasPointFromClient(cx, cy) {
  const rect = canvas.getBoundingClientRect();
  return { x: (cx - rect.left), y: (cy - rect.top) };
}
function isLeftSide(clientX) { return clientX < window.innerWidth * 0.5; }

function setJoyCenter() {
  const baseRect = joy.base.getBoundingClientRect();
  joy.baseX = baseRect.left + baseRect.width / 2;
  joy.baseY = baseRect.top + baseRect.height / 2;
  joy.dx = 0; joy.dy = 0;
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

  const baseRect = joy.base.getBoundingClientRect();
  const stickRect = joy.stick.getBoundingClientRect();
  const ox = (baseRect.width - stickRect.width) / 2;
  const oy = (baseRect.height - stickRect.height) / 2;
  joy.stick.style.transform = `translate(${ox + ndx}px, ${oy + ndy}px)`;
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

    if (!joy.active && isLeftSide(clientX)) {
      joy.active = true;
      joy.id = t.identifier ?? "mouse";
      setJoyCenter();
      updateJoy(clientX, clientY);
      continue;
    }

    if (!game.pointer.active) {
      game.pointer.active = true;
      game.pointer.id = t.identifier ?? "mouse";
      game.pointer.downAt = performance.now();
      game.pointer.downX = clientX;
      game.pointer.downY = clientY;

      const p = getCanvasPointFromClient(clientX, clientY);
      game.pointer.x = p.x;
      game.pointer.y = p.y;

      const target = pickEnemyAtScreen(p.x, p.y, 44);
      game.pointer.holdTargetId = target?.id ?? null;
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
      const heldMs = performance.now() - game.pointer.downAt;

      const targetId = game.pointer.holdTargetId;
      const target = targetId
        ? world.entities.find(en => en.id === targetId && en.type === "enemy" && en.alive)
        : null;

      if (target) {
        const charge = clamp(heldMs / (combat.chargeTime * 1000), 0, 1);
        castLightning(target, charge);
      }

      game.pointer.active = false;
      game.pointer.id = null;
      game.pointer.holdTargetId = null;
    }
  }
}

// prevent scroll ONLY on canvas interactions (not the whole document)
canvas.addEventListener("touchmove", (e) => { if (!game.paused) e.preventDefault(); }, { passive: false });

window.addEventListener("mousedown", pointerDown);
window.addEventListener("mousemove", pointerMove);
window.addEventListener("mouseup", pointerUp);

window.addEventListener("touchstart", pointerDown, { passive: false });
window.addEventListener("touchmove", pointerMove, { passive: false });
window.addEventListener("touchend", pointerUp, { passive: false });
window.addEventListener("touchcancel", pointerUp, { passive: false });

UI.interactBtn.addEventListener("click", () => {
  const chest = nearestChestInRange(44);
  if (chest) openChest(chest);
});
document.getElementById("slotInv").addEventListener("click", () => toast("Inventory is coming soon."));

// ---------- Controller ----------
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && pads[0];
  if (!gp) return { mx: 0, my: 0, cast: false, charge: false };
  return {
    mx: gp.axes[0] || 0,
    my: gp.axes[1] || 0,
    cast: gp.buttons[0]?.pressed || false,
    charge: gp.buttons[7]?.pressed || false,
  };
}
let gpWasCast = false;
let gpChargeStart = 0;

// ---------- Combat ----------
function pickEnemyAtScreen(sx, sy, radiusPx) {
  const wx = sx + game.camera.x;
  const wy = sy + game.camera.y;

  let best = null;
  let bestD = Infinity;

  for (const e of world.entities) {
    if (e.type !== "enemy" || !e.alive) continue;
    const d = dist2(wx, wy, e.x, e.y);
    const rr = (radiusPx + e.r) ** 2;
    if (d <= rr && d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function castLightning(enemy, charge01) {
  if (game.paused) return;
  if (combat.cooldown > 0) return;

  const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
  if (d > combat.range) { toast("Too far!"); return; }

  const mult = 1 + (combat.maxChargeMult - 1) * charge01;
  const dmg = Math.round(combat.baseDamage * player.atk * mult);

  enemy.hp -= dmg;

  fx.bolts.push({ t: 0, dur: 0.12, x1: player.x, y1: player.y, x2: enemy.x, y2: enemy.y });
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
    if (d <= r && d < bestD) { best = e; bestD = d; }
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
  } else toast("Chest opened!");
}

// ---------- Collision ----------
function collideCircleRect(cx, cy, r, rect) {
  const px = clamp(cx, rect.x, rect.x + rect.w);
  const py = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - px;
  const dy = cy - py;
  return (dx * dx + dy * dy) < (r * r);
}
function resolvePlayerCollision(nx, ny) {
  nx = clamp(nx, player.r, world.w - player.r);
  ny = clamp(ny, player.r, world.h - player.r);

  for (const b of world.barriers) {
    if (collideCircleRect(nx, ny, player.r, b)) {
      if (!collideCircleRect(player.x, ny, player.r, b)) nx = player.x;
      else if (!collideCircleRect(nx, player.y, player.r, b)) ny = player.y;
      else { nx = player.x; ny = player.y; }
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
    if (canAggro) {
      e.swoopTimer += dt;
      if (e.swoopTimer > 1.25) { e.swoopTimer = 0; e.swoopPhase = 1; }
    } else { e.swoopTimer = 0; e.swoopPhase = 0; }

    if (e.swoopPhase === 1 && canAggro) {
      const n = norm(dx, dy);
      e.x += n.x * e.speed * 1.35 * dt;
      e.y += n.y * e.speed * 1.35 * dt;
      if (d < e.atkRange && e.cooldown === 0) { damagePlayer(e.dmg); e.cooldown = 0.8; e.swoopPhase = 0; }
    } else if (canAggro) {
      const n = norm(dx, dy);
      const sideX = -n.y * 0.4;
      const sideY = n.x * 0.4;
      e.x += (n.x + sideX) * e.speed * 0.55 * dt;
      e.y += (n.y + sideY) * e.speed * 0.55 * dt;
      if (d < e.atkRange && e.cooldown === 0) { damagePlayer(e.dmg); e.cooldown = 0.9; }
    }
    return;
  }

  if (canAggro) {
    const n = norm(dx, dy);
    e.x += n.x * e.speed * dt;
    e.y += n.y * e.speed * dt;

    if (d < e.atkRange && e.cooldown === 0) {
      damagePlayer(e.dmg);
      e.cooldown = (e.kind === "spider_big") ? 0.9 : 0.75;
    }
  } else {
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
        player.hp = player.hpMax;
        player.invuln = 0;
        loadScene(currentSceneKey);
      }
    );
  }
}

// ---------- Scene progression ----------
function checkExits() {
  for (const ex of world.exits) {
    const inside = player.x > ex.x && player.x < ex.x + ex.w && player.y > ex.y && player.y < ex.y + ex.h;
    if (inside) {
      if (currentSceneKey === "Clearing" && ex.to === "Forest") {
        if (!allEnemiesDefeated()) { toast("Defeat all enemies before entering the forest."); return; }
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

// ---------- Aesthetic drawing helpers ----------
function drawSoftShadow(sx, sy, rx, ry, a = 0.18) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawGlowDot(x, y, r, a = 0.9) {
  ctx.save();
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}
function drawLeg(sx, sy, ex, ey, midx, midy, w0, w1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(0,0,0,0.95)";
  ctx.lineWidth = w0;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(midx, midy, ex, ey);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.12;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = w1;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(midx, midy, ex, ey);
  ctx.stroke();

  ctx.restore();
}

// ---------- Render: decor primitives ----------
function drawGrassTuft(x, y, s = 1) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);

  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 6, 18, 8, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const blades = 18;
  for (let i = 0; i < blades; i++) {
    const a = -0.9 + (i / (blades - 1)) * 1.8;
    const h = 22 + Math.sin(i * 1.7) * 6;
    ctx.strokeStyle = `rgba(70, 200, 120, ${0.55 + Math.random() * 0.25})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(Math.sin(a) * 10, -h * 0.35, Math.sin(a) * 14, -h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlowerPatch(x, y, r = 22) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(60, 180, 110, 0.9)";
  ctx.beginPath();
  ctx.ellipse(0, 4, r * 0.9, r * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const n = 10;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * TAU;
    const rad = Math.random() * r * 0.7;
    const fxp = Math.cos(ang) * rad;
    const fyp = Math.sin(ang) * rad * 0.7 - 6;

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(fxp, fyp, 2.2, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(125,211,252,0.95)";
    ctx.beginPath();
    ctx.arc(fxp + 1.2, fyp - 0.6, 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawCenterFlowerBed(x, y, r = 80) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(125,211,252,0.55)";
  ctx.beginPath();
  ctx.ellipse(0, 6, r * 1.05, r * 0.7, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 140; i++) {
    const ang = Math.random() * TAU;
    const rad = Math.pow(Math.random(), 0.6) * r * 0.75;
    const fxp = Math.cos(ang) * rad;
    const fyp = Math.sin(ang) * rad * 0.6;
    const size = 1.6 + Math.random() * 1.6;

    ctx.fillStyle = (i % 3 === 0) ? "rgba(255,255,255,0.95)" : "rgba(96,165,250,0.95)";
    ctx.beginPath();
    ctx.arc(fxp, fyp, size, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

function drawGravestone(x, y, s = 1) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);

  drawSoftShadow(0, 18, 18, 7, 0.18);

  ctx.fillStyle = "rgba(185,195,210,0.95)";
  ctx.strokeStyle = "rgba(20,30,45,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-16, -18, 32, 40, 10);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(20,30,45,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.lineTo(2, 2);
  ctx.lineTo(-2, 12);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawFence(x, y, w = 140) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = "rgba(220,230,245,0.45)";
  ctx.lineWidth = 3;

  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w / 2, 10); ctx.lineTo(w / 2, 10); ctx.stroke();

  for (let i = -w / 2; i <= w / 2; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, -6);
    ctx.lineTo(i, 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawRock(x, y, r = 18) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);

  drawSoftShadow(0, 10, r * 0.9, r * 0.45, 0.16);

  ctx.fillStyle = "rgba(160,175,200,0.9)";
  ctx.strokeStyle = "rgba(20,30,45,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.75, 0.2, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawRiver(d) {
  const p = w2s(d.x, d.y);
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(70, 140, 220, 0.65)";
  ctx.beginPath();
  ctx.roundRect(0, 0, d.w, d.h, 26);
  ctx.fill();

  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 10; i++) {
    const yy = 10 + i * 18;
    ctx.beginPath();
    ctx.ellipse(d.w * 0.35 + Math.sin((game.time * 1.2) + i) * 16, yy, d.w * 0.22, 5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTreeTrunk(x, y, s = 1) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);

  drawSoftShadow(0, 34, 32, 12, 0.18);

  ctx.fillStyle = "rgba(130, 95, 70, 0.95)";
  ctx.strokeStyle = "rgba(25,20,18,0.25)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-12, 0, 24, 42, 10);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawTreeCanopy(x, y, s = 1) {
  const p = w2s(x, y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);

  const blobs = [
    { x: -26, y: -8, r: 26 }, { x: 0, y: -18, r: 32 }, { x: 26, y: -8, r: 26 }, { x: -8, y: -36, r: 22 }, { x: 12, y: -38, r: 20 }
  ];
  for (const b of blobs) {
    ctx.fillStyle = "rgba(70, 190, 120, 0.92)";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.arc(-10, -32, 12, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawOakTrunk(x, y, s = 1) { drawTreeTrunk(x, y, s * 1.05); }
function drawOakCanopy(x, y, s = 1) { drawTreeCanopy(x, y, s * 1.12); }

function drawDecorItem(d) {
  if (d.kind === "grassTuft") drawGrassTuft(d.x, d.y, d.scale ?? 1);
  else if (d.kind === "flowerPatch") drawFlowerPatch(d.x, d.y, d.r ?? 22);
  else if (d.kind === "centerBed") drawCenterFlowerBed(d.x, d.y, d.r ?? 80);
  else if (d.kind === "grave") drawGravestone(d.x, d.y, d.scale ?? 1);
  else if (d.kind === "fence") drawFence(d.x, d.y, d.w ?? 140);
  else if (d.kind === "rock") drawRock(d.x, d.y, d.r ?? 18);
  else if (d.kind === "river") drawRiver(d);
  else if (d.kind === "tree_trunk") drawTreeTrunk(d.x, d.y, d.scale ?? 1);
  else if (d.kind === "tree_canopy") drawTreeCanopy(d.x, d.y, d.scale ?? 1);
  else if (d.kind === "oak_trunk") drawOakTrunk(d.x, d.y, d.scale ?? 1);
  else if (d.kind === "oak_canopy") drawOakCanopy(d.x, d.y, d.scale ?? 1);
}

// ---------- Atmospheric fog layer ----------
function drawAtmosphere() {
  let top = "rgba(255,255,255,0.06)";
  let mid = "rgba(125,211,252,0.05)";
  let bottom = "rgba(0,0,0,0.18)";
  let motes = 28;

  if (currentSceneKey === "PeaceGarden") {
    top = "rgba(255,255,255,0.07)";
    mid = "rgba(125,211,252,0.05)";
    bottom = "rgba(0,0,0,0.16)";
    motes = 34;
  } else if (currentSceneKey === "Cemetery") {
    top = "rgba(210,220,245,0.05)";
    mid = "rgba(140,160,210,0.06)";
    bottom = "rgba(0,0,0,0.28)";
    motes = 18;
  } else if (currentSceneKey === "Clearing") {
    top = "rgba(255,255,255,0.06)";
    mid = "rgba(140,200,255,0.05)";
    bottom = "rgba(0,0,0,0.18)";
    motes = 24;
  } else if (currentSceneKey === "Forest") {
    top = "rgba(220,255,235,0.05)";
    mid = "rgba(125,211,252,0.04)";
    bottom = "rgba(0,0,0,0.22)";
    motes = 22;
  }

  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  const v = ctx.createRadialGradient(
    window.innerWidth * 0.5, window.innerHeight * 0.55, Math.min(window.innerWidth, window.innerHeight) * 0.25,
    window.innerWidth * 0.5, window.innerHeight * 0.55, Math.max(window.innerWidth, window.innerHeight) * 0.75
  );
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  for (let i = 0; i < motes; i++) {
    const x = (Math.sin(game.time * 0.25 + i * 13.1) * 0.5 + 0.5) * window.innerWidth;
    const y = (Math.sin(game.time * 0.18 + i * 7.7) * 0.5 + 0.5) * window.innerHeight;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3) * 0.35, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Rendering: enemies + player + chests ----------
function drawEnemySilhouette(e) {
  const sx = e.x - game.camera.x;
  const sy = e.y - game.camera.y;

  drawSoftShadow(sx, sy + e.r + 10, e.r * 1.25, e.r * 0.5, 0.20);

  if (e.kind.startsWith("spider")) drawSpiderSilhouette(e, sx, sy);
  else if (e.kind === "crow") drawCrowSilhouette(e, sx, sy);

  const hp01 = clamp(e.hp / e.maxHp, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(sx - 18, sy - e.r - 14, 36, 6);
  ctx.fillStyle = "rgba(125,211,252,0.75)";
  ctx.fillRect(sx - 18, sy - e.r - 14, 36 * hp01, 6);
  ctx.restore();
}

function drawSpiderSilhouette(e, sx, sy) {
  const t = game.time * 3 + e.id * 0.4;
  const bodyR = (e.kind === "spider_big") ? 20 : 16;
  const headR = (e.kind === "spider_big") ? 12 : 9;
  const legLen = (e.kind === "spider_big") ? 44 : 36;
  const spread = (e.kind === "spider_big") ? 1.15 : 1.0;

  // legs first
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const idx = i % 4;

    const attachAng = (-0.55 + idx * 0.28) * side;
    const ax = sx + Math.cos(attachAng) * bodyR * 0.8;
    const ay = sy + Math.sin(attachAng) * bodyR * 0.35 + 4;

    const dirAng = (1.05 + idx * 0.22) * side;
    const wave = Math.sin(t + i * 0.9) * 0.16;

    const midx = ax + Math.cos(dirAng + wave) * (legLen * 0.55) * spread;
    const midy = ay + Math.sin(dirAng + wave) * (legLen * 0.30) + 10;

    const ex = ax + Math.cos(dirAng + wave) * legLen * spread;
    const ey = ay + Math.sin(dirAng + wave) * (legLen * 0.55) + 20;

    const w0 = (e.kind === "spider_big") ? 5 : 4;
    const w1 = 2;
    drawLeg(ax, ay, ex, ey, midx, midy, w0, w1, 1);
  }

  // body silhouette
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.95)";

  ctx.beginPath();
  ctx.ellipse(sx - 2, sy + 4, bodyR * 1.05, bodyR * 0.85, -0.15, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(sx + bodyR * 0.75, sy + 6, headR * 1.05, headR * 0.85, 0.1, 0, TAU);
  ctx.fill();

  // subtle highlight sheen
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(sx - 6, sy - 6, bodyR * 0.55, bodyR * 0.35, -0.2, 0, TAU);
  ctx.fill();

  // eyes (tiny glow)
  ctx.globalAlpha = 1;
  const eyeY = sy + 5;
  const eyeX = sx + bodyR * 0.90;
  drawGlowDot(eyeX - 3, eyeY, 7, 0.7);
  drawGlowDot(eyeX + 3, eyeY, 7, 0.7);

  ctx.restore();
}

function drawCrowSilhouette(e, sx, sy) {
  const t = game.time * 2 + e.id * 0.3;
  const flap = Math.sin(t) * 0.18;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.92)";

  // body
  ctx.beginPath();
  ctx.ellipse(sx, sy + 2, 18, 12, -0.1, 0, TAU);
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.ellipse(sx + 14, sy - 6, 8, 7, 0, 0, TAU);
  ctx.fill();

  // beak
  ctx.beginPath();
  ctx.moveTo(sx + 22, sy - 6);
  ctx.lineTo(sx + 34, sy - 2);
  ctx.lineTo(sx + 22, sy + 2);
  ctx.closePath();
  ctx.fill();

  // wing
  ctx.beginPath();
  ctx.ellipse(sx - 8, sy, 22, 10, -0.6 + flap, 0, TAU);
  ctx.fill();

  // tail
  ctx.beginPath();
  ctx.moveTo(sx - 18, sy + 6);
  ctx.lineTo(sx - 34, sy + 14);
  ctx.lineTo(sx - 16, sy + 14);
  ctx.closePath();
  ctx.fill();

  // eye glow
  drawGlowDot(sx + 16, sy - 7, 7, 0.75);

  ctx.restore();
}

function drawChestEntity(c) {
  const sx = c.x - game.camera.x;
  const sy = c.y - game.camera.y;

  // glow for unopened
  if (!c.opened) {
    ctx.save();
    ctx.globalAlpha = 0.20 + 0.10 * Math.sin(game.time * 3.6);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 34);
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // shadow
  drawSoftShadow(sx, sy + 16, 18, 7, 0.18);

  // chest body
  ctx.save();
  ctx.fillStyle = c.opened ? "rgba(180,190,205,0.55)" : "rgba(255,255,255,0.88)";
  ctx.strokeStyle = "rgba(125,211,252,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx - 14, sy - 10, 28, 22, 6);
  ctx.fill();
  ctx.stroke();

  // latch
  ctx.fillStyle = "rgba(6,16,24,0.55)";
  ctx.fillRect(sx - 3, sy - 2, 6, 6);
  ctx.restore();
}

function drawPlayer() {
  const sx = player.x - game.camera.x;
  const sy = player.y - game.camera.y;

  ctx.save();

  // halo at base
  ctx.globalAlpha = 0.40;
  const halo = ctx.createRadialGradient(sx, sy + 16, 0, sx, sy + 16, 34);
  halo.addColorStop(0, "rgba(96,165,250,0.42)");
  halo.addColorStop(1, "rgba(96,165,250,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(sx, sy + 16, 34, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // shadow
  drawSoftShadow(sx, sy + 20, 18, 8, 0.18);

  // capsule body
  const w = 26, h = 34;
  ctx.globalAlpha = player.invuln > 0 ? 0.75 : 1;
  ctx.fillStyle = "rgba(233,238,252,1)";
  ctx.strokeStyle = "rgba(125,211,252,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, sy - h / 2, w, h, 13);
  ctx.fill();
  ctx.stroke();

  // ears
  ctx.fillStyle = "rgba(233,238,252,1)";
  ctx.beginPath();
  ctx.roundRect(sx - 10, sy - 26, 6, 14, 6);
  ctx.roundRect(sx + 4, sy - 26, 6, 14, 6);
  ctx.fill();

  ctx.restore();
}

// ---------- Lightning + pops ----------
function drawEffects(dt) {
  // bolts
  for (let i = fx.bolts.length - 1; i >= 0; i--) {
    const b = fx.bolts[i];
    b.t += dt;
    if (b.t >= b.dur) { fx.bolts.splice(i, 1); continue; }

    const a = 1 - (b.t / b.dur);
    ctx.save();
    ctx.globalAlpha = 0.9 * a;

    // bloom-ish underglow
    ctx.strokeStyle = "rgba(125,211,252,0.25)";
    ctx.lineWidth = 10;
    drawJaggedBolt(b);

    // crisp bolt
    ctx.strokeStyle = "rgba(125,211,252,1)";
    ctx.lineWidth = 3;
    drawJaggedBolt(b);

    ctx.restore();
  }

  // pops
  for (let i = fx.pops.length - 1; i >= 0; i--) {
    const p = fx.pops[i];
    p.t += dt;
    if (p.t >= p.dur) { fx.pops.splice(i, 1); continue; }

    const a = 1 - (p.t / p.dur);
    const y = (p.y - game.camera.y) - 12 - (p.t * 40);
    const x = (p.x - game.camera.x);

    ctx.save();
    ctx.globalAlpha = 0.9 * a;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "700 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.text, x, y);
    ctx.restore();
  }
}

function drawJaggedBolt(b) {
  const x1 = b.x1 - game.camera.x;
  const y1 = b.y1 - game.camera.y;
  const x2 = b.x2 - game.camera.x;
  const y2 = b.y2 - game.camera.y;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  const steps = 7;
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
}

// ---------- Background + barriers + exits ----------
function drawBackground() {
  let bgTop = "#0b1a14";
  let bgBot = "#07110d";

  if (currentSceneKey === "Cemetery") { bgTop = "#120f18"; bgBot = "#07060a"; }
  if (currentSceneKey === "Clearing") { bgTop = "#0c1420"; bgBot = "#07101a"; }
  if (currentSceneKey === "Forest") { bgTop = "#06130f"; bgBot = "#04100c"; }

  const g = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
  g.addColorStop(0, bgTop);
  g.addColorStop(1, bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  // subtle ground grain
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * window.innerWidth;
    const y = Math.random() * window.innerHeight;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawBarriers() {
  // Keep invisible by default; enable for debugging if needed
  // ctx.save();
  // ctx.globalAlpha = 0.15;
  // ctx.fillStyle = "#fff";
  // for (const b of world.barriers) ctx.fillRect(b.x - game.camera.x, b.y - game.camera.y, b.w, b.h);
  // ctx.restore();
}

function drawExits() {
  // subtle hint zones (very faint)
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "rgba(125,211,252,1)";
  for (const ex of world.exits) ctx.fillRect(ex.x - game.camera.x, ex.y - game.camera.y, ex.w, ex.h);
  ctx.restore();
}

// ---------- Depth sorting render pipeline ----------
function renderDepthSorted() {
  // ground layer
  for (const d of (world.decor?.ground ?? [])) drawDecorItem(d);

  // build renderables (objects + chests + enemies + player)
  const R = [];

  // decor objects (tree trunks, rocks, graves)
  for (const d of (world.decor?.objects ?? [])) {
    R.push({ y: d.y, draw: () => drawDecorItem(d) });
  }

  // chests
  for (const e of world.entities) {
    if (e.type === "chest") {
      R.push({ y: e.y, draw: () => drawChestEntity(e) });
    }
  }

  // enemies
  for (const e of world.entities) {
    if (e.type === "enemy" && e.alive) {
      R.push({ y: e.y, draw: () => drawEnemySilhouette(e) });
    }
  }

  // player
  R.push({ y: player.y, draw: () => drawPlayer() });

  // sort by y (tie-breaker stable-ish)
  R.sort((a, b) => a.y - b.y);

  // draw
  for (const r of R) r.draw();

  // canopy (over everything)
  for (const d of (world.decor?.canopy ?? [])) drawDecorItem(d);
}

// ---------- Camera with slight Y bias (3D appeal) ----------
function applyCamera(dt) {
  const screenAnchorX = 0.5;
  const screenAnchorY = 0.62;

  const targetX = player.x - window.innerWidth * screenAnchorX;
  const targetY = player.y - window.innerHeight * screenAnchorY;

  const smooth = 1 - Math.pow(0.0001, dt);
  game.camera.x += (targetX - game.camera.x) * smooth;
  game.camera.y += (targetY - game.camera.y) * smooth;

  game.camera.x = clamp(game.camera.x, 0, Math.max(0, world.w - window.innerWidth));
  game.camera.y = clamp(game.camera.y, 0, Math.max(0, world.h - window.innerHeight));

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

  if (Math.abs(gp.mx) > 0.12 || Math.abs(gp.my) > 0.12) {
    mx = gp.mx;
    my = gp.my;
  }

  const mlen = Math.hypot(mx, my);
  if (mlen > 1) { mx /= mlen; my /= mlen; }

  player.vx = mx * player.speed;
  player.vy = my * player.speed;

  const res = resolvePlayerCollision(player.x + player.vx * dt, player.y + player.vy * dt);
  player.x = res.nx;
  player.y = res.ny;

  // enemy updates
  for (const e of world.entities) {
    if (e.type === "enemy") updateEnemy(e, dt);
  }

  // controller attack (optional)
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

// ---------- Render ----------
function render(dt) {
  applyCamera(dt);
  drawBackground();

  // world hints (optional boundary stroke)
  // ctx.save();
  // ctx.globalAlpha = 0.15;
  // ctx.strokeStyle = "rgba(255,255,255,0.35)";
  // ctx.lineWidth = 2;
  // ctx.strokeRect(-game.camera.x, -game.camera.y, world.w, world.h);
  // ctx.restore();

  drawBarriers();
  drawExits();

  // depth-sorted world
  renderDepthSorted();

  // effects above
  drawEffects(dt);

  // atmosphere on top
  drawAtmosphere();

  // subtle direction hint in PeaceGarden
  if (currentSceneKey === "PeaceGarden") {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "700 14px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("→ Cemetery", 1020 - game.camera.x, 290 - game.camera.y);
    ctx.restore();
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
