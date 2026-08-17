# Cricut fabrication export

Image Express can convert the active editor artboard into dimensionally accurate,
Cricut-ready SVG cutting sheets. Open **Export → Cricut (SVG)**.

## Pipeline

1. The artboard is captured as a lossless PNG at its export bounds.
2. Pixel luminance is reduced to a binary foreground mask using the selected
   threshold. Transparent pixels stay out of the cut shape.
3. Four-connected foreground islands become independent material parts. Boundary
   edges are followed into closed loops, including interior holes.
4. Closed loops are simplified with a seam-safe Ramer-Douglas-Peucker pass. The
   tolerance is specified in physical millimetres, so node reduction stays stable
   when the source resolution changes.
5. A multi-strategy MaxRects pass tests area, long-edge, height, and width orderings,
   with optional 90-degree rotation. The lowest-sheet, lowest-used-extent result is
   selected deterministically.
6. Each sheet is emitted with `width`, `height`, and `viewBox` expressed in
   millimetres. Paths use `fill-rule="evenodd"`, remain closed, and contain no
   embedded raster image.

This processing is local. Artwork is not uploaded to an AI service, and repeating
an export with the same settings produces the same placement.

## Controls

- **Threshold / invert:** choose which pixels become material.
- **Finished width / scale:** set the physical size before packing. Height follows
  the captured artboard aspect ratio.
- **Node tolerance:** higher values reduce path nodes and machine direction changes;
  very high values can remove intentional detail.
- **Minimum feature area:** drops disconnected specks smaller than the physical area.
- **Sheet dimensions, safe margin, and spacing:** define the material workspace.
- **Smart rotation:** lets nesting evaluate both 0° and 90° orientations.

The preview reports nodes before and after simplification, part count, sheet count,
physical cut size, and total-sheet material yield. A one-sheet plan downloads as
SVG. Multi-sheet plans download as a ZIP containing one SVG per sheet and a JSON
fabrication manifest.

## Stacked profiles

Enable **Slice extruded silhouette** to build a volumetric object by laminating the
same traced contour from flat stock. Layer count is:

`ceil(target depth / material thickness)`

If the target is not an exact multiple of the stock thickness, the manifest records
the required depth of the final layer. The stock itself is not automatically milled
thinner; sand, shim, or choose stock appropriate for that final remainder.

Two registration circles are generated for every component on every layer. They are
stored in separate SVG elements with `data-operation="score"`. Cricut Design Space
does not guarantee that custom operation metadata is applied on import, so verify
that the blue circles are assigned to **Score** (or **Draw**) before sending the job.

### Scope

The current stratification mode is an **extruded 2D silhouette** workflow. It does
not slice arbitrary GLB/STL mesh geometry or infer a height field from image shading.
Those require a separate 3D cross-section source and should not be approximated from
a flat raster when dimensional accuracy matters.

## Design Space handoff

Import each SVG at its encoded size and keep the aspect-ratio lock enabled. Design
Space sometimes displays rounded dimensions; do not resize the sheet contents to
the mat dimensions. The outer SVG sheet is a coordinate system, not a cut rectangle.
