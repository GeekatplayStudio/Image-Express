# Canvas Agent Guidelines

This document outlines the rules and best practices for AI agents performing direct manipulations on the Fabric.js canvas in Image Express.

## 1. Interaction Rules
- **Selection Safety**: Always check if a layer is locked before modifying its properties (`left`, `top`, `width`, `height`, `angle`, `opacity`, `fill`, etc.). If `obj.locked === true` or `obj.selectable === false`, do not attempt modifications.
- **Layer Locking**: The background canvas artboard is a special locked layer. Do not allow users or automated actions to select, reorder, or unlock the primary canvas boundary object.
- **Coordinated Rendering**: Any alteration to object geometries or visual attributes MUST be followed by `canvas.requestRenderAll()` to synchronize Fabric's internal state with the rendering context.
- **Paint Folders**: Group all brush strokes during a paint session under a single paint folder layer. Starting a new tool or session must automatically commit the previous group.

## 2. Command Pattern Adherence
- Actions that alter the canvas state should be dispatched as explicit Commands to support full undo/redo stacks. Do not perform direct mutations on canvas objects outside the command dispatcher.
