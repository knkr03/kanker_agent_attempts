/**
 * Movement Breakpoint — Foundry VTT v13/v14, D&D 5e.
 * This is a visual aid only. It never changes TokenDocument data.
 *
 * Remaining movement is estimated from actor walking speed and Foundry's
 * movement-history costs since a recorded baseline. Because neither Foundry
 * nor every D&D5e version provides a universal remaining-movement property,
 * this code fails open if it cannot determine the relevant values.
 */
const ID = "movement-breakpoint";
const PREFIX = "[Movement Breakpoint]";
const SUPPORTED = new Set([13, 14]);
const S = {
  disabled: false,
  tokenProto: null,
  tokenMoveProto: null,
  tokenLifecycleProto: null,
  layerProto: null,
  drag: null,
  baselines: new Map(),
  warnings: new Set()
};

const setting = key => {
  try { return game.settings.get(ID, key); } catch (_) { return undefined; }
};
function warnOnce(key, message) {
  if (S.warnings.has(key)) return;
  S.warnings.add(key);
  console.warn(PREFIX, message);
  ui.notifications?.warn(message);
}
function disable(message) {
  if (S.disabled) return;
  S.disabled = true;
  clearDrag();
  console.error(PREFIX, message);
  ui.notifications?.warn(message);
}
function majorVersion() {
  const m = String(game.release?.generation ?? game.version ?? "").match(/\d+/);
  return m ? Number(m[0]) : NaN;
}
function tokenKey(token) {
  const d = token?.document ?? token;
  return d?.id ? String(d.parent?.id ?? canvas.scene?.id ?? "scene") + ":" + d.id : null;
}
function historyOf(token) {
  const h = (token?.document ?? token)?.movementHistory;
  return Array.isArray(h) ? h : null;
}
function setBaseline(token) {
  const key = tokenKey(token), history = historyOf(token);
  if (key && history) S.baselines.set(key, { length: history.length, scene: canvas.scene?.id });
}
function baselineAll() {
  for (const t of canvas.tokens?.placeables ?? []) setBaseline(t);
}
function walkingSpeed(token) {
  const m = (token?.actor ?? token?.document?.actor)?.system?.attributes?.movement;
  for (const value of [m?.speeds?.walk, m?.walk, m?.walk?.value, m?.speeds?.walk?.value]) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}
function spentSinceBaseline(token) {
  const key = tokenKey(token), h = historyOf(token), b = S.baselines.get(key);
  if (!key || !h || !b || (b.scene && b.scene !== canvas.scene?.id)) return null;
  // A shorter history means it was reset; treat the current history as new.
  const start = Math.min(b.length, h.length);
  let total = 0;
  for (const point of h.slice(start)) {
    const cost = Number(point?.cost);
    if (Number.isFinite(cost) && cost > 0) total += cost;
  }
  return total;
}
function limitPixels(token) {
  const speed = walkingSpeed(token);
  const size = Number(canvas.scene?.grid?.size);
  const distance = Number(canvas.scene?.grid?.distance);
  const spent = spentSinceBaseline(token);
  if (speed === null || !Number.isFinite(size) || size <= 0 ||
      !Number.isFinite(distance) || distance <= 0 || spent === null) return null;
  return Math.max(0, speed - spent) / distance * size;
}
function eligible(token) {
  if (!token?.document || !token.actor) return false;
  if (canvas.tokens?.controlled?.length !== 1 || canvas.tokens.controlled[0] !== token) return false;
  return setting("tokenScope") !== "characters" || token.actor.type === "character";
}
function localPoint(global) {
  try {
    const p = canvas.stage.toLocal(global);
    return { x: p.x, y: p.y };
  } catch (_) { return null; }
}
function globalPoint(point) {
  try {
    const p = canvas.stage.toGlobal(point);
    return { x: p.x, y: p.y };
  } catch (_) { return null; }
}
function setPointer(event, x, y) {
  try {
    event.global.x = x; event.global.y = y;
    return Number.isFinite(event.global.x) && Number.isFinite(event.global.y);
  } catch (_) { return false; }
}
function destroyGhost(drag = S.drag) {
  if (!drag?.ghost) return;
  const ghost = drag.ghost; drag.ghost = null;
  try {
    ghost.parent?.removeChild(ghost);
    ghost.destroy({ children: true, texture: false, baseTexture: false });
  } catch (e) { console.debug(PREFIX, "Ghost cleanup issue", e); }
}
function clearTimer(drag) {
  if (drag?.timer) clearTimeout(drag.timer);
  if (drag) drag.timer = null;
}
function clearDrag() {
  const d = S.drag;
  if (!d) return;
  clearTimer(d); destroyGhost(d); S.drag = null;
}
function makeGhost(d) {
  if (!setting("ghostEnabled") || d.ghost || !d.token?.mesh?.texture) return;
  const Sprite = globalThis.PIXI?.Sprite;
  if (!Sprite) return;
  try {
    const g = new Sprite(d.token.mesh.texture);
    g.eventMode = "none";
    g.interactive = false;
    g.alpha = Math.max(0.1, Math.min(0.8, Number(setting("ghostOpacity") || 40) / 100));
    g.width = d.token.w; g.height = d.token.h;
    g.rotation = (Number(d.token.document.rotation) || 0) * Math.PI / 180;
    g.zIndex = 999999;
    g.position.set(d.originX, d.originY);
    d.ghost = g;
    canvas.tokens.addChild(g);
  } catch (e) { console.warn(PREFIX, "Ghost preview unavailable", e); }
}
function moveGhost(d, x, y) {
  if (!d.ghost) makeGhost(d);
  d.ghost?.position.set(x, y);
}
function release(d) {
  if (S.drag !== d || d.released) return;
  d.released = true;
  clearTimer(d);
  destroyGhost(d);
}
function beginReleaseTimer(d) {
  if (d.timer || d.released) return;
  const delay = Math.max(100, Math.min(1000, Number(setting("delayMs")) || 200));
  const check = () => {
    d.timer = null;
    if (S.drag !== d || d.released || d.lastDistance <= d.limit) return;
    // Require ongoing/recent pointer motion. A stationary pointer alone won't release.
    const quiet = performance.now() - d.lastMoveAt;
    if (quiet <= 70 && performance.now() - d.crossedAt >= delay) return release(d);
    d.timer = setTimeout(check, 25);
  };
  d.timer = setTimeout(check, delay);
}
function resetBreakpoint(d) {
  clearTimer(d);
  d.released = false;
  d.crossedAt = null;
  destroyGhost(d);
}
function startDrag(token, event) {
  clearDrag();
  if (S.disabled || setting("enabled") === false || !eligible(token)) return;
  const pointer = event?.global && localPoint(event.global);
  if (!pointer) return;
  const limit = limitPixels(token);
  if (limit === null) {
    warnOnce("movement", "Movement Breakpoint couldn't read reliable movement history for this token. Normal dragging will continue; tracking becomes available after a usable baseline is recorded.");
    return;
  }
  S.drag = {
    token, originX: Number(token.x), originY: Number(token.y),
    pointerX: pointer.x, pointerY: pointer.y, limit,
    released: false, crossedAt: null, lastMoveAt: performance.now(),
    lastX: pointer.x, lastY: pointer.y, lastDistance: 0, timer: null, ghost: null
  };
}
function dragMove(layer, event, original, args) {
  const d = S.drag;
  if (!d || S.disabled || setting("enabled") === false || !event?.global) return original.apply(layer, args);
  if (!eligible(d.token) || !canvas.ready || d.token.document?.parent?.id !== canvas.scene?.id) {
    clearDrag();
    return original.apply(layer, args);
  }
  const saved = { x: event.global.x, y: event.global.y };
  const p = localPoint(saved);
  if (!p) return original.apply(layer, args);
  const dx = p.x - d.pointerX, dy = p.y - d.pointerY;
  const distance = Math.hypot(dx, dy);
  d.lastDistance = distance;
  if (Math.hypot(p.x - d.lastX, p.y - d.lastY) > 0.25) {
    d.lastMoveAt = performance.now(); d.lastX = p.x; d.lastY = p.y;
  }
  if (distance <= d.limit) {
    resetBreakpoint(d);
    return original.apply(layer, args);
  }
  if (d.released) return original.apply(layer, args);
  if (d.crossedAt === null) {
    d.crossedAt = performance.now();
    d.lastMoveAt = performance.now();
    beginReleaseTimer(d);
  }
  const factor = d.limit === 0 ? 0 : d.limit / distance;
  const targetX = d.originX + dx, targetY = d.originY + dy;
  const clampX = d.originX + dx * factor, clampY = d.originY + dy * factor;
  moveGhost(d, targetX, targetY);
  // Preserve the pointer/token grab offset, and restore the real event after
  // Foundry computes the constrained preview.
  const clampedGlobal = globalPoint({
    x: d.pointerX + clampX - d.originX,
    y: d.pointerY + clampY - d.originY
  });
  if (!clampedGlobal || !setPointer(event, clampedGlobal.x, clampedGlobal.y)) {
    clearDrag();
    warnOnce("event", "Movement Breakpoint couldn't safely constrain this drag. Normal dragging will continue.");
    return original.apply(layer, args);
  }
  try { return original.apply(layer, args); }
  finally { setPointer(event, saved.x, saved.y); }
}
function patchTokenStart() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (!proto || typeof proto._onDragLeftStart !== "function" ||
      typeof proto._onDragLeftMove !== "function") {
    disable("Movement Breakpoint disabled: required token drag API unavailable. Normal token dragging is unchanged.");
    return;
  }

  // Foundry's token interaction manager invokes Token's drag callbacks. Patching
  // TokenLayer._onDragLeftMove alone is unreliable because the interaction
  // manager may retain the callback it captured when the layer was activated.
  // Wrap the token's own move callback, which is on the same lifecycle as the
  // _onDragLeftStart callback verified by the runtime diagnostic.
  if (S.tokenProto !== proto) {
    const originalStart = proto._onDragLeftStart;
    proto._onDragLeftStart = function (...args) {
      startDrag(this, args[0]);
      try { return originalStart.apply(this, args); }
      catch (e) { clearDrag(); throw e; }
    };
    S.tokenProto = proto;
  }

  if (S.tokenMoveProto !== proto) {
    const originalMove = proto._onDragLeftMove;
    proto._onDragLeftMove = function (...args) {
      return dragMove(this, args[0], originalMove, args);
    };
    S.tokenMoveProto = proto;
  }

  // Clear temporary preview state on the token's own lifecycle as well as the
  // layer lifecycle. This covers Foundry versions where callbacks are captured
  // before a layer prototype is patched.
  if (S.tokenLifecycleProto !== proto) {
    for (const method of ["_onDragLeftDrop", "_onDragLeftCancel"]) {
      if (typeof proto[method] !== "function") continue;
      const original = proto[method];
      proto[method] = function (...args) {
        try { return original.apply(this, args); }
        finally { clearDrag(); }
      };
    }
    S.tokenLifecycleProto = proto;
  }
}
function patchLayer() {
  const layer = canvas.tokens, proto = layer?.constructor?.prototype;
  if (!proto || typeof proto._onDragLeftDrop !== "function" ||
      typeof proto._onDragLeftCancel !== "function") {
    disable("Movement Breakpoint disabled: required token-layer drag cleanup API unavailable. Normal token dragging is unchanged.");
    return;
  }
  if (S.layerProto === proto) return;
  const drop = proto._onDragLeftDrop, cancel = proto._onDragLeftCancel;
  proto._onDragLeftDrop = function (...args) {
    try { return drop.apply(this, args); } finally { clearDrag(); }
  };
  proto._onDragLeftCancel = function (...args) {
    try { return cancel.apply(this, args); } finally { clearDrag(); }
  };
  S.layerProto = proto;
}
function registerSettings() {
  game.settings.register(ID, "enabled", { name: "Enable movement breakpoint", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(ID, "delayMs", { name: "Breakpoint delay (ms)", hint: "Default: 200 ms.", scope: "client", config: true, type: Number, default: 200, range: { min: 100, max: 1000, step: 25 } });
  game.settings.register(ID, "ghostEnabled", { name: "Show ghost destination", scope: "client", config: true, type: Boolean, default: true });
  game.settings.register(ID, "ghostOpacity", { name: "Ghost opacity (%)", scope: "client", config: true, type: Number, default: 40, range: { min: 10, max: 80, step: 5 } });
  game.settings.register(ID, "tokenScope", { name: "Affected tokens", scope: "world", config: true, type: String, default: "all", choices: { all: "All tokens", characters: "Character actors only" } });
}
Hooks.once("init", registerSettings);
Hooks.once("ready", () => {
  if (!SUPPORTED.has(majorVersion())) {
    disable("Movement Breakpoint disabled: Foundry v" + game.version + " is unsupported. Supported versions: v13 and v14.");
    return;
  }
  if (game.system?.id !== "dnd5e") {
    disable("Movement Breakpoint requires the D&D 5e system. The module has disabled itself.");
    return;
  }
  baselineAll();
  ui.notifications?.info("Movement Breakpoint: movement spent before module initialization may not be known until a fresh combat-turn baseline is recorded.");
  patchTokenStart();
});
Hooks.on("canvasReady", () => {
  if (S.disabled || setting("enabled") === false) return;
  patchTokenStart();
  patchLayer();
  baselineAll();
});
Hooks.on("updateCombat", (combat, changes) => {
  if (changes.turn === undefined && changes.round === undefined && changes.combatantId === undefined) return;
  const td = combat?.combatant?.token;
  const token = td?.object ?? td;
  if (token) setBaseline(token);
});
Hooks.on("canvasTearDown", clearDrag);
Hooks.on("deleteScene", clearDrag);
Hooks.on("deactivateToken", clearDrag);
Hooks.on("updateSetting", doc => {
  if (doc?.key === ID + ".enabled" && doc.value === false) clearDrag();
});
console.info(PREFIX, "Loaded.");
