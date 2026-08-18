/**
 * Foldcraft — unfold 3D models into flat panels with machine-ready fold
 * grooves.
 *
 * Public surface. Everything exported here is a pure function over
 * JSON-serialisable types, so any stage can be exposed as an HTTP route or an
 * MCP tool without adaptation. The composed pipeline is `buildFoldPlan`; the
 * stages remain callable on their own.
 */

export const FOLDCRAFT_VERSION = '0.1.0';

// Types and machine/material presets
export * from './foldcraftTypes';

// Geometry primitives (vectors, adjacency, dihedral measurement)
export {
    add, sub, scale, dot, cross, normalize, length3, distance3,
    faceNormal, faceCentroid, faceArea,
    buildEdgeMap, buildFaceAdjacency, undirectedEdgeKey,
    dihedralDegrees, signedVolume6, boundingBox,
} from './meshTopology';

// S: load — GLB / STL / OBJ, dependency-free
export { loadModel } from './loadModel';
export type { LoadModelOptions, LoadedModel, ModelFormat } from './loadModel';

// S1: ingest — weld, orient outward, repair, report
export { ingestMesh } from './ingest';

// S2: low-poly — planar regions, vertex snapping, polygon merging
export { simplifyMesh, panelizeMesh } from './simplify';
export type { PanelizeReport } from './simplify';
export { growPlanarRegions, planarizeIteratively, measurePlanarity, modelExtent } from './planarize';
export type { PlanarRegion } from './planarize';

// S4: segmentation — flattest-edge-first growth into panels
export { segmentIntoPanels } from './segment';
export type { SegmentResult } from './segment';

// S5: rigid flattening of a known patch
export { flattenPatchRigid } from './flattenRigid';
export type { FlattenOptions } from './flattenRigid';

// S6: fold grooves
export { planGrooves, requiredBladeTiltDeg } from './grooves';
export type { GroovePlan } from './grooves';

// S8: packing and export
export { packSheets, placePoint } from './packSheets';
export { exportSheetSvg, seamLabels } from './exportSvg';
export type { SvgExportOptions } from './exportSvg';

// S9: validation
export { validateFoldPlan } from './validate';

// Machine layer: toolpath IR, G-code post, simulator, camera registration
export { buildSheetToolpath, chainSegments } from './machine/toolpath';
export type { Toolpath, ToolpathOp, ToolpathOptions } from './machine/toolpath';
export { toGcode, estimateMinutes } from './machine/gcode';
export type { GcodeOptions } from './machine/gcode';
export { simulateToolpath } from './machine/simulator';
export type { SimulationReport, SimulationViolation, SimulateOptions } from './machine/simulator';
export {
    homographyFromPairs, applyHomography, registrationErrorMm, expectedFiducials,
} from './machine/registration';
export type { Homography, PointPair } from './machine/registration';

// Composed pipeline
export { buildFoldPlan } from './buildFoldPlan';
export type { FoldPipelineOptions, FoldPipelineResult } from './buildFoldPlan';
