# Movement Breakpoint

A Foundry VTT module for D&D 5e, intended primarily for gridless maps. During a single-token drag, it constrains the real token preview at an estimated remaining-walking-movement radius and displays a translucent ghost at the intended destination. After 200 ms of continued movement beyond the limit, the constraint releases for the remainder of the drag.

## Compatibility
- Foundry VTT v13 and v14
- D&D 5e
- Gridless scenes (scene grid size and distance must still be configured for scale conversion)

## Install
Copy this folder, modules/movement-breakpoint, to your Foundry user data directory at Data/modules/movement-breakpoint, then enable it in Manage Modules. Settings are under Configure Settings > Module Settings.

## Settings
- Enable movement breakpoint (client, on)
- Breakpoint delay (client, 200 ms)
- Show ghost destination (client, on)
- Ghost opacity (client, 40%)
- Affected tokens (world, all tokens)

## Movement calculation limitations
Foundry and D&D 5e do not expose a universal remaining-movement counter that is reliable in all configurations. This version estimates remaining movement as walking speed minus movement-history waypoint costs since a baseline recorded by this module. Movement spent before the baseline cannot be reconstructed. Baselines are refreshed at canvas initialization and on combat updates; test carefully in your D&D5e version and with movement-related modules.

This is a visual drag aid, not movement enforcement. Once released, Foundry's ordinary drop/placement behavior is used. It does not edit actor data or create a TokenDocument for the ghost. The ghost is a temporary PIXI sprite and does not reproduce every token overlay.

## Safety and compatibility
The module checks Foundry major version and required internal drag methods. If those checks fail, it warns and disables itself. Internal APIs may change in ways that a startup check cannot fully predict. Test in a disposable world before using in a live game. Modules that also wrap token drag methods may need compatibility testing.

## Test checklist
1. Drag within remaining movement.
2. Cross the limit and verify clamp plus ghost.
3. Continue moving for 200 ms and verify release.
4. Stop at the limit and verify stationary time alone does not release.
5. Return within the limit and verify immediate reset.
6. Cross again and verify a fresh delay.
7. Drop/cancel and verify ghost cleanup.
8. Change scene, disable module, and reload canvas.
9. Multi-select tokens and verify the module leaves group drag alone.
10. Test separately on Foundry v13 and v14.
