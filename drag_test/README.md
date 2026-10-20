# Drag Test (Foundry VTT)

A minimal Foundry VTT module that limits a token's live drag preview to **30 scene units from the point where the drag began**.

## Behavior

- The token follows the cursor normally within the 30-unit radius.
- Moving the cursor farther away keeps the token preview on the 30-unit boundary.
- The limit is based on straight-line distance, not grid steps.
- It uses the scene's grid size and distance settings, so it also works on gridless scenes with a configured grid distance.
- It does not change ordinary token placement after the drag or impose a movement limit on other game actions.

## Install

1. Copy the `drag_test` folder into your Foundry VTT `Data/modules/` directory.
2. In Foundry, open **Manage Modules** and enable **Drag Test — 30 Unit Limit**.
3. Reload the world if needed.

## Compatibility

Manifest targets Foundry VTT v13 and v14. This is a small test module that wraps Foundry's token-layer drag handlers; because those handlers are internal APIs, test it against your exact Foundry build and report any console errors.

## Configuration

The limit is currently fixed at 30 scene units in `scripts/drag-test.js` (`MAX_DISTANCE_UNITS`).

## Notes

The module is intended for single-token drag testing. Foundry's internal drag implementation may vary by version; inspect the browser console for the `[drag_test]` startup message to confirm the wrapper installed.
