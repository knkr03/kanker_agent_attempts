# Movement Breakpoint

Foundry VTT v13/v14 module for D&D 5e. This is an early development build.

## Behavior
- Single-token dragging only; multi-token drags are left untouched.
- Uses straight-line distance from the dragged token's origin, independent of token size.
- Clamps the visual token position at the movement allowance.
- Releases after 200 ms of continued pointer movement beyond the limit, for the rest of that drag.
- Returning within the movement radius clears the pending release timer and ghost immediately.
- Shows a temporary translucent image preview at the intended destination.
- Foundry retains final drop and collision handling.
- Fails open with warnings if required APIs, scale, or movement data are unavailable.

## Important limitations
- D&D 5e does not expose a universal, authoritative remaining-movement counter for every table/module setup. This build estimates remaining movement during combat by tracking token displacement made through Foundry updates during the current combat turn, subtracting it from the actor's walking speed. Outside combat it assumes a fresh movement allowance. Teleports, forced movement, unobserved updates, special movement modes, and other modules may make this estimate inaccurate.
- Actor movement units must match scene units. Mismatches are not converted automatically; normal dragging is preserved.
- The ghost copies the token's texture as a translucent sprite. Depending on token art and Foundry version, it may not reproduce every token mask, status overlay, border, or shader.
- The adapter wraps internal Foundry drag methods. Despite version guards, v13 and v14 must be tested separately before live use.
- This is not a movement enforcement module: the user may release beyond the allowance, and Foundry's ordinary placement behavior decides the final position.

## Install
Copy the movement-breakpoint folder into your Foundry user data Data/modules/ directory, reload Foundry, then enable Movement Breakpoint in Manage Modules.

## Settings
- Enable module
- Release delay (default 200 ms)
- Show destination ghost (default enabled)
- Ghost opacity (default 40%)

## V1 scope
No pathfinding, movement enforcement, multi-token support, or unrelated features.
