/**
 * Drag Test — 30 Unit Limit
 * Foundry VTT v13–v14
 * Restricts a single token's drag preview to a 30-scene-unit radius.
 */
const MODULE_ID = "drag_test";
const MAX_DISTANCE_UNITS = 30;

Hooks.once("ready", () => {
  const layer = canvas?.tokens;
  const layerProto = layer?.constructor?.prototype;
  const TokenClass = layer?.placeableClass ?? layer?.placeables?.[0]?.constructor;
  const tokenProto = TokenClass?.prototype;

  if (!layerProto || !tokenProto) {
    console.error(`[${MODULE_ID}] Could not find TokenLayer or Token placeable class.`);
    return;
  }
  if (tokenProto.__dragTest30TokenInstalled) {
    console.warn(`[${MODULE_ID}] Token drag limiter already installed.`);
    return;
  }

  const tokenStart = tokenProto._onDragLeftStart;
  const tokenMove = tokenProto._onDragLeftMove;
  const tokenCancel = tokenProto._onDragLeftCancel;
  const layerMove = layerProto._onDragLeftMove;
  const layerDrop = layerProto._onDragLeftDrop;
  const layerCancel = layerProto._onDragLeftCancel;

  if (typeof tokenStart !== "function" || typeof tokenMove !== "function") {
    console.error(`[${MODULE_ID}] Token drag handlers not found on ${TokenClass.name}.`);
    return;
  }

  // Foundry initiates token dragging from the Token placeable, not from
  // TokenLayer._onDragLeftStart. TokenLayer._draggedToken is set there.
  tokenProto._onDragLeftStart = function(event, ...args) {
    const result = tokenStart.call(this, event, ...args);
    const dragLayer = this.layer ?? canvas.tokens;
    dragLayer._dragTest30Origin = {
      token: this,
      x: Number(this.x),
      y: Number(this.y)
    };
    console.info(`[${MODULE_ID}] Token drag started`, {
      token: this.document?.name ?? this.name ?? this.id,
      x: dragLayer._dragTest30Origin.x,
      y: dragLayer._dragTest30Origin.y
    });
    return result;
  };

  tokenProto._onDragLeftMove = function(event, ...args) {
    const result = tokenMove.call(this, event, ...args);
    clampToken(this.layer ?? canvas.tokens, this);
    return result;
  };

  if (typeof tokenCancel === "function") {
    tokenProto._onDragLeftCancel = function(event, ...args) {
      try {
        return tokenCancel.call(this, event, ...args);
      } finally {
        (this.layer ?? canvas.tokens)._dragTest30Origin = null;
      }
    };
  }

  // Keep layer-level movement covered for Foundry versions/systems that
  // perform part of the preview workflow on the layer.
  if (typeof layerMove === "function") {
    layerProto._onDragLeftMove = function(event, ...args) {
      const result = layerMove.call(this, event, ...args);
      clampToken(this, this._draggedToken);
      return result;
    };
  }
  if (typeof layerDrop === "function") {
    layerProto._onDragLeftDrop = function(event, ...args) {
      try {
        clampToken(this, this._draggedToken);
        return layerDrop.call(this, event, ...args);
      } finally {
        this._dragTest30Origin = null;
      }
    };
  }
  if (typeof layerCancel === "function") {
    layerProto._onDragLeftCancel = function(event, ...args) {
      try {
        return layerCancel.call(this, event, ...args);
      } finally {
        this._dragTest30Origin = null;
      }
    };
  }

  tokenProto.__dragTest30TokenInstalled = true;
  console.info(`[${MODULE_ID}] Drag limit enabled: ${MAX_DISTANCE_UNITS} scene units.`);

  function clampToken(dragLayer, token) {
    const origin = dragLayer?._dragTest30Origin;
    if (!origin || !token || token !== origin.token) return;

    const gridSize = Number(canvas.dimensions?.size);
    const unitsPerGrid = Number(canvas.scene?.grid?.distance);
    if (!(gridSize > 0) || !(unitsPerGrid > 0)) return;

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

    if (token.position && typeof token.position.set === "function") {
      token.position.set(x, y);
    } else {
      token.x = x;
      token.y = y;
    }
    token.refresh?.();
  }
});
