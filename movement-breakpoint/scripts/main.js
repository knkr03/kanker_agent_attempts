/**
 * Movement Breakpoint for Foundry VTT v13/v14 + dnd5e.
 * Single-token visual movement aid. No movement is enforced at drop time.
 */
const MODULE_ID = "movement-breakpoint";
const S = {
  installed: false, disabled: false, warned: new Set(), drag: null,
  spent: new Map(), pending: new Map(), patchedProto: null, originals: null
};
const keyFor = tokenDoc => (tokenDoc.parent?.id ?? canvas.scene?.id ?? "scene") + ":" + tokenDoc.id;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable Movement Breakpoint", scope: "client", config: true,
    type: Boolean, default: true, hint: "Enable the movement breakpoint for single-token drags."
  });
  game.settings.register(MODULE_ID, "delay", {
    name: "Release delay (milliseconds)", scope: "client", config: true,
    type: Number, default: 200, range: {min: 50, max: 1000, step: 25},
    hint: "Time the pointer must keep moving beyond the breakpoint before it releases."
  });
  game.settings.register(MODULE_ID, "ghostEnabled", {
    name: "Show destination ghost", scope: "client", config: true,
    type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "ghostOpacity", {
    name: "Ghost opacity (%)", scope: "client", config: true,
    type: Number, default: 40, range: {min: 10, max: 80, step: 5}
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    disableSafely("This module requires the D&D 5e game system.");
    return;
  }
  if (game.settings.get(MODULE_ID, "enabled")) installAdapter();
});

Hooks.on("canvasReady", () => {
  if (!S.disabled && game.settings.get(MODULE_ID, "enabled")) installAdapter();
  cleanupDrag();
});
Hooks.on("canvasTearDown", cleanupDrag);
Hooks.on("closeSettingsConfig", () => {
  if (!game.settings.get(MODULE_ID, "enabled")) cleanupDrag();
});

Hooks.on("preUpdateToken", (doc, changes) => {
  if (!("x" in changes) && !("y" in changes)) return;
  const scale = pixelsPerUnit();
  if (!Number.isFinite(scale)) return;
  const x = Number(changes.x ?? doc.x), y = Number(changes.y ?? doc.y);
  S.pending.set(keyFor(doc), Math.hypot(x - doc.x, y - doc.y) / scale);
});
Hooks.on("updateToken", doc => {
  const key = keyFor(doc);
  const moved = S.pending.get(key);
  S.pending.delete(key);
  if (Number.isFinite(moved) && moved > 0 && game.combat?.started) {
    S.spent.set(key, (S.spent.get(key) ?? 0) + moved);
  }
});
Hooks.on("updateCombat", (combat, changes) => {
  if (("turn" in changes) || ("round" in changes && changes.round !== combat.round)) {
    const combatant = combat.combatant;
    const tokenDoc = combatant?.token;
    if (tokenDoc) S.spent.set(keyFor(tokenDoc), 0);
  }
});
Hooks.on("deleteCombat", combat => {
  const sceneId = combat.scene?.id ?? canvas.scene?.id;
  for (const k of S.spent.keys()) if (k.startsWith(sceneId + ":")) S.spent.delete(k);
});

function warnOnce(key, message) {
  if (S.warned.has(key)) return;
  S.warned.add(key);
  console.warn("[" + MODULE_ID + "] " + message);
  ui.notifications.warn("Movement Breakpoint: " + message);
}
function disableSafely(message) {
  S.disabled = true;
  cleanupDrag();
  warnOnce("disabled-" + message, message + " Movement Breakpoint has been disabled; native token dragging is left alone.");
}
function pixelsPerUnit() {
  const size = canvas?.dimensions?.size;
  const distance = canvas?.scene?.grid?.distance;
  if (!Number.isFinite(size) || !Number.isFinite(distance) || size <= 0 || distance <= 0) return NaN;
  return size / distance;
}
function movementSpeed(token) {
  const actor = token?.actor;
  if (!actor || actor.type === "vehicle") return NaN;
  const movement = actor.system?.attributes?.movement;
  const value = movement?.walk ?? movement?.speeds?.walk;
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed < 0) return NaN;
  const actorUnits = movement?.units;
  const sceneUnits = canvas.scene?.grid?.units;
  if (actorUnits && sceneUnits && actorUnits !== sceneUnits) {
    warnOnce("unit-mismatch", "Actor movement units (" + actorUnits + ") differ from scene units (" + sceneUnits + "). This drag will use normal Foundry behavior.");
    return NaN;
  }
  return speed;
}
function remainingMovement(token) {
  const speed = movementSpeed(token);
  if (!Number.isFinite(speed)) return NaN;
  if (!game.combat?.started) return speed;
  return Math.max(0, speed - (S.spent.get(keyFor(token.document)) ?? 0));
}
function getPointerTarget(event, token) {
  const stage = canvas.stage;
  try {
    if (typeof event?.getLocalPosition === "function") return event.getLocalPosition(stage);
    if (typeof event?.data?.getLocalPosition === "function") return event.data.getLocalPosition(stage);
    const d = event?.interactionData?.destination;
    if (Number.isFinite(d?.x) && Number.isFinite(d?.y)) return d;
  } catch (_) {}
  return {x: token.x, y: token.y};
}
function installAdapter() {
  if (S.disabled || S.installed || !canvas?.tokens) return;
  const proto = canvas.tokens.constructor?.prototype;
  const required = ["_onDragLeftStart", "_onDragLeftMove", "_onDragLeftDrop", "_onDragLeftCancel"];
  if (!proto || required.some(k => typeof proto[k] !== "function")) {
    disableSafely("The expected Foundry token drag API is unavailable.");
    return;
  }
  const originals = Object.fromEntries(required.map(k => [k, proto[k]]));
  S.patchedProto = proto;
  S.originals = originals;
  proto._onDragLeftStart = function(event) {
    cleanupDrag();
    const selected = [...(canvas.tokens.controlled ?? [])];
    const eligible = selected.length === 1 ? selected[0] : null;
    const start = eligible ? {x: eligible.x, y: eligible.y} : null;
    const result = originals._onDragLeftStart.call(this, event);
    if (!game.settings.get(MODULE_ID, "enabled") || S.disabled || !eligible) return result;
    try {
      const ppu = pixelsPerUnit(), remaining = remainingMovement(eligible);
      if (!Number.isFinite(ppu) || !Number.isFinite(remaining)) {
        warnOnce("movement-unavailable", "Could not read reliable D&D 5e movement or scene scale. Normal dragging will continue.");
        return result;
      }
      S.drag = {layer:this, token:eligible, origin:start, limitPx:remaining * ppu,
        ppu, overSince:null, lastPointerMove:0, released:false, ghost:null, timer:null, lastTarget:start};
    } catch (err) {
      console.error("[" + MODULE_ID + "] Could not initialize drag limiter.", err);
      cleanupDrag();
    }
    return result;
  };
  proto._onDragLeftMove = function(event) {
    const result = originals._onDragLeftMove.call(this, event);
    if (S.disabled || !game.settings.get(MODULE_ID, "enabled")) return result;
    try { updateDrag(event); }
    catch (err) {
      console.error("[" + MODULE_ID + "] Drag adapter failed; disabling to preserve native dragging.", err);
      disableSafely("A runtime error occurred in the drag adapter.");
    }
    return result;
  };
  proto._onDragLeftDrop = function(event) {
    try { return originals._onDragLeftDrop.call(this, event); }
    finally { cleanupDrag(); }
  };
  proto._onDragLeftCancel = function(event) {
    try { return originals._onDragLeftCancel.call(this, event); }
    finally { cleanupDrag(); }
  };
  S.installed = true;
  console.info("[" + MODULE_ID + "] Drag adapter installed.");
}
function updateDrag(event) {
  const d = S.drag;
  if (!d || d.released || !d.token || !d.token.parent) return;
  const target = getPointerTarget(event, d.token);
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return;
  const moved = Math.hypot(target.x - (d.lastTarget?.x ?? target.x), target.y - (d.lastTarget?.y ?? target.y));
  if (moved > 0.5) d.lastPointerMove = performance.now();
  d.lastTarget = {x:target.x, y:target.y};
  const dx = target.x - d.origin.x, dy = target.y - d.origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= d.limitPx || distance === 0) {
    d.overSince = null;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    destroyGhost(d);
    return;
  }
  if (d.overSince === null) {
    d.overSince = performance.now();
    d.lastPointerMove = performance.now();
    scheduleRelease(d);
  }
  if (game.settings.get(MODULE_ID, "ghostEnabled")) updateGhost(d, target);
  const ratio = d.limitPx / distance;
  d.token.position.set(d.origin.x + dx * ratio, d.origin.y + dy * ratio);
}
function scheduleRelease(d) {
  if (d.timer) clearTimeout(d.timer);
  const delay = game.settings.get(MODULE_ID, "delay");
  const check = () => {
    if (S.drag !== d || d.released || d.overSince === null) return;
    const now = performance.now();
    if ((now - d.overSince) >= delay && (now - d.lastPointerMove) <= 60) {
      d.released = true;
      destroyGhost(d);
      d.timer = null;
      return;
    }
    d.timer = setTimeout(check, 20);
  };
  d.timer = setTimeout(check, delay);
}
function updateGhost(d, target) {
  if (!PIXI?.Sprite || !d.token.mesh?.texture) return;
  if (!d.ghost) {
    const ghost = new PIXI.Sprite(d.token.mesh.texture);
    ghost.anchor.set(0, 0);
    ghost.width = d.token.w;
    ghost.height = d.token.h;
    ghost.alpha = game.settings.get(MODULE_ID, "ghostOpacity") / 100;
    ghost.rotation = d.token.rotation ?? 0;
    ghost.eventMode = "none";
    ghost.interactive = false;
    ghost.name = "movement-breakpoint-ghost";
    canvas.tokens.addChild(ghost);
    d.ghost = ghost;
  }
  d.ghost.position.set(target.x, target.y);
  d.ghost.width = d.token.w;
  d.ghost.height = d.token.h;
}
function destroyGhost(d) {
  if (!d?.ghost) return;
  d.ghost.destroy({children:true});
  d.ghost = null;
}
function cleanupDrag() {
  const d = S.drag;
  if (!d) return;
  if (d.timer) clearTimeout(d.timer);
  destroyGhost(d);
  S.drag = null;
}
