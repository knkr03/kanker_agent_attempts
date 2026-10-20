/**
 * Drag Test — 30 Unit Limit
 * Foundry VTT v13–v14
 *
 * Clamps the live token drag preview to 30 scene units from the token's
 * original position. The pointer can continue moving; the token preview
 * remains on the 30-unit radius until the drag is released.
 */
const MODULE_ID = "drag_test";
const MAX_DISTANCE_UNITS = 30;

Hooks.once("ready", () => {
  const layer = canvas?.tokens;
  const proto = layer?.constructor?.prototype;
  if (!proto || proto.__dragTest30Installed) {
    console.warn(`[${MODULE_ID}] Token layer unavailable; drag limiter not installed.`);
    return;
  }

  const originalStart = proto._onDragLeftStart;
  const originalMove = proto._onDragLeftMove;
  if (typeof originalStart !== "function" || typeof originalMove !== "function") {
    console.error(`[${MODULE_ID}] Could not find expected token drag handlers.`);
    return;
  }

  proto._onDragLeftStart = function(event) {
    const result = originalStart.call(this, event);
    // Save the actual drag origin before subsequent mouse-move events.
    const dragged = getDraggedTokens(this);
    this._dragTest30Origins = new Map(
      dragged.map(token => [token.id ?? token.document?.id, {
        token,
        x: Number(token.document?.x ?? token.x),
        y: Number(token.document?.y ?? token.y)
      }])
    );
    return result;
  };

  proto._onDragLeftMove = function(event) {
    const result = originalMove.call(this, event);
    clampDraggedTokens(this);
    return result;
  };

  // The module only wraps the handlers once, even if ready hooks are rerun.
  proto.__dragTest30Installed = true;
  console.info(`[${MODULE_ID}] Drag limit enabled: ${MAX_DISTANCE_UNITS} scene units.`);

  function getDraggedTokens(tokenLayer) {
    const candidates = tokenLayer._dragged ?? tokenLayer._controlled ?? canvas.tokens.controlled ?? [];
    const tokens = Array.isArray(candidates) ? candidates : [candidates];
    return tokens.filter(token => token && (token.document || Number.isFinite(token.x)));
  }

  function clampDraggedTokens(tokenLayer) {
    const origins = tokenLayer._dragTest30Origins;
    if (!origins?.size) return;

    const gridSize = Number(canvas.dimensions?.size);
    const sceneUnitsPerGrid = Number(canvas.scene?.grid?.distance);
    if (!(gridSize > 0) || !(sceneUnitsPerGrid > 0)) return;
    const pixelsPerUnit = gridSize / sceneUnitsPerGrid;
    const maxPixels = MAX_DISTANCE_UNITS * pixelsPerUnit;

    for (const { token, x: originX, y: originY } of origins.values()) {
      if (!Number.isFinite(originX) || !Number.isFinite(originY)) continue;

      // Read the live placeable coordinates, not the document's last saved
      // coordinates, so the visual drag preview is constrained immediately.
      const currentX = Number(token.x);
      const currentY = Number(token.y);
      if (!Number.isFinite(currentX) || !Number.isFinite(currentY)) continue;

      const dx = currentX - originX;
      const dy = currentY - originY;
      const length = Math.hypot(dx, dy);
      if (length <= maxPixels || length === 0) continue;

      const scale = maxPixels / length;
      token.position?.set?.(originX + dx * scale, originY + dy * scale);
      // PlaceableObject.position may not be writable through set() on all
      // supported versions; assign coordinates as a fallback.
      if (Math.hypot(Number(token.x) - originX, Number(token.y) - originY) > maxPixels + 0.5) {
        token.x = originX + dx * scale;
        token.y = originY + dy * scale;
        token.refresh?.();
      }
    }
  }
});
