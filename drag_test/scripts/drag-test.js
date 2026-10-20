/**
 * Drag Test — 30 Unit Limit
 * Foundry VTT v13–v14
 *
 * Restricts the active single-token drag preview to a 30-scene-unit radius
 * around the token's original position.
 */
const MODULE_ID = "drag_test";
const MAX_DISTANCE_UNITS = 30;

Hooks.once("ready", () => {
  const layer = canvas?.tokens;
  const proto = layer?.constructor?.prototype;

  if (!proto) {
    console.error(`[${MODULE_ID}] TokenLayer unavailable; drag limiter not installed.`);
    return;
  }
  if (proto.__dragTest30Installed) {
    console.warn(`[${MODULE_ID}] Drag limiter already installed.`);
    return;
  }

  const originalStart = proto._onDragLeftStart;
  const originalMove = proto._onDragLeftMove;
  const originalDrop = proto._onDragLeftDrop;
  const originalCancel = proto._onDragLeftCancel;

  if (typeof originalStart !== "function" || typeof originalMove !== "function") {
    console.error(`[${MODULE_ID}] Expected TokenLayer drag handlers not found.`);
    return;
  }

  proto._onDragLeftStart = function(event, ...args) {
    const result = originalStart.call(this, event, ...args);
    // Foundry tracks the active token drag on the layer as _draggedToken.
    const token = this._draggedToken;
    if (token) {
      this._dragTest30Origin = {
        token,
        x: Number(token.document?.x ?? token.x),
        y: Number(token.document?.y ?? token.y)
      };
      console.debug(`[${MODULE_ID}] Drag started`, {
        token: token.document?.name ?? token.name ?? token.id,
        x: this._dragTest30Origin.x,
        y: this._dragTest30Origin.y
      });
    } else {
      this._dragTest30Origin = null;
      console.warn(`[${MODULE_ID}] Drag started but TokenLayer._draggedToken is empty.`);
    }
    return result;
  };

  proto._onDragLeftMove = function(event, ...args) {
    const result = originalMove.call(this, event, ...args);
    clampActiveToken(this);
    return result;
  };

  if (typeof originalDrop === "function") {
    proto._onDragLeftDrop = function(event, ...args) {
      try {
        clampActiveToken(this);
        return originalDrop.call(this, event, ...args);
      } finally {
        this._dragTest30Origin = null;
      }
    };
  }

  if (typeof originalCancel === "function") {
    proto._onDragLeftCancel = function(event, ...args) {
      try {
        return originalCancel.call(this, event, ...args);
      } finally {
        this._dragTest30Origin = null;
      }
    };
  }

  proto.__dragTest30Installed = true;
  console.info(`[${MODULE_ID}] Drag limit enabled: ${MAX_DISTANCE_UNITS} scene units.`);

  function clampActiveToken(tokenLayer) {
    const origin = tokenLayer._dragTest30Origin;
    // Re-read Foundry's active drag token in case it was assigned after start.
    const token = tokenLayer._draggedToken ?? origin?.token;
    if (!origin || !token) return;

    const gridSize = Number(canvas.dimensions?.size);
    const unitsPerGrid = Number(canvas.scene?.grid?.distance);
    if (!(gridSize > 0) || !(unitsPerGrid > 0)) {
      console.warn(`[${MODULE_ID}] Invalid grid dimensions; cannot clamp drag.`);
      return;
    }

    // Token document x/y and placeable x/y are canvas pixel coordinates.
    const maxPixels = MAX_DISTANCE_UNITS * gridSize / unitsPerGrid;
    const currentX = Number(token.x);
    const currentY = Number(token.y);
    if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) return;

    const dx = currentX - origin.x;
    const dy = currentY - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= maxPixels || distance === 0) return;

    const scale = maxPixels / distance;
    const x = origin.x + dx * scale;
    const y = origin.y + dy * scale;

    // Move the active preview/placeable to the edge of the allowed radius.
    if (token.position && typeof token.position.set === "function") {
      token.position.set(x, y);
    } else {
      token.x = x;
      token.y = y;
    }
    token.refresh?.();
  }
});