# Drag Test (Foundry VTT)

A minimal Foundry VTT module that limits a token's live drag preview to **30 scene units from the point where the drag began**.

## Install directly from GitHub in Foundry

Use this manifest URL in Foundry's **Install Module** dialog:

`https://raw.githubusercontent.com/knkr03/kanker_agent_attempts/main/drag_test/module.json`

1. Open Foundry VTT and go to **Add-on Modules**.
2. Click **Install Module**.
3. Paste the manifest URL above into the **Manifest URL** field.
4. Click **Install**.
5. Enable **Drag Test — 30 Unit Limit** in Manage Modules.

Project page: https://github.com/knkr03/kanker_agent_attempts/tree/main/drag_test

## Behavior

- The token follows the cursor normally within the 30-unit radius.
- Moving the cursor farther away keeps the token preview on the 30-unit boundary.
- The limit is based on straight-line distance, not grid steps.
- It uses the scene's grid size and distance settings.
- It does not change ordinary token placement after the drag or impose a movement limit on other game actions.

## Compatibility

Manifest targets Foundry VTT v13 and v14. This test module wraps Foundry's token-layer drag handlers; because those handlers are internal APIs, test it against your exact Foundry build.

## Configuration

The limit is fixed at 30 scene units in `scripts/drag-test.js` (`MAX_DISTANCE_UNITS`).

## Notes

The module is intended for single-token drag testing. Inspect the browser console for the `[drag_test]` startup message to confirm the wrapper installed.
