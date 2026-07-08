# Application Analysis Report

## Architecture Overview

**Core Framework**: Next.js 16 (React 19)
**Platform**: Web & Desktop (via Electron)
**Language**: TypeScript

### Key Subsystems

1.  **Canvas Engine**:
    *   **2D**: Powered by `fabric.js` (v7). Handles the main design canvas, layers, and image manipulation.
    *   **3D**: Powered by `three.js` via `@react-three/fiber`. Used for previewing designs on 3D models (`Asset3DPreview`, `ThreeDGenerator`).
    
2.  **UI Library**:
    *   Custom component library likely based on shadcn/ui or similar patterns (Radix UI primitives maybe used, but `lucide-react` is present as distinct dependency).
    *   Styling via Tailwind CSS 4.
    
3.  **State Management**:
    *   Appears to rely on React Context (`DialogProvider`, `ToastProvider`) and likely local component state or URL state.
    
4.  **Desktop Integration**:
    *   Electron wrapper around the Next.js application.
    *   IPC communication for file system access likely present (implied by `electron/preload.js`).

## Component Analysis

### Critical Components (High Risk / High Value)
*   **`DesignCanvas.tsx`**: The heart of the application. Integrates Fabric.js logic. High complexity due to canvas event handling, layer management, and imperative canvas APIs mixed with React lifecycle.
*   **`ThreeDLayerEditor.tsx` & `ThreeDGenerator.tsx`**: Complex 3D rendering interactions.
*   **`PropertiesPanel.tsx`**: Must dynamically render controls based on selected object type.

### Reusable UI Components
*   Found in `src/components/ui`.
*   Standard primitives: `Button`, `Input`, `Slider`, etc.
*   These are low risk individually but critical for consistency.

## Testing Strategy

### 1. Unit Testing (Jest + React Testing Library)
*   **Scope**: Utility functions (`lib/utils.ts`, `lib/fabric-utils.ts`) and stateless UI components (`components/ui/*`).
*   **Goal**: Verify logic correctness and rendering states.

### 2. Integration Testing
*   **Scope**: Complex components like `PropertiesPanel` or `AssetLibrary`.
*   **Goal**: Verify interactions between components (e.g., clicking a layer updates the property panel).

### 3. Canvas Testing (Challenges)
*   Testing `fabric.js` canvas in `jsdom` is difficult because `jsdom` lacks full Canvas API support.
*   **Strategy**: Mock `fabric` methods or use integration tests that don't rely on pixel-perfect canvas rendering, but rather check if Fabric object properties are updated.

## Recommendations
1.  **Mocking**: Heavy mocking of `fabric` and `three` will be required for unit tests.
2.  **E2E Testing**: Consider Playwright or Cypress for testing the actual canvas interactions, as Jest/JSDOM will struggle with WebGL/Canvas events.
3.  **CI/CD**: Integrate linting and unit tests into the build pipeline.
