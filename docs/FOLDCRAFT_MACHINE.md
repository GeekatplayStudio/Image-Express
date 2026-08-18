# Foldcraft reference machine — ultrasonic tilting-knife cutter

The open-source machine Foldcraft targets: a converted diode-laser gantry
carrying an ultrasonic knife on programmable tilt and swivel axes, with an
overhead camera for sheet registration. This document records the design
decisions the software side depends on, the recommended electronics, and what
remains the builder's engineering.

The companion software contract is `packages/foldcraft` — in particular
`MachineProfile` (what the software believes about the machine) and
`machine/gcode.ts` (the words it sends).

## Base platform

Donor: a **TwoTrees TT-5.2 Pro-class diode laser frame** with 600 mm extension
rails, laser module removed. What the donor provides: 600 × 600 mm working
area, X/Y gantry with belts and steppers, frame extrusion, cable management.
What it does not provide: a Z axis (diode lasers focus, they do not plunge),
any rotary axis, and a controller with enough drivers. All three are added.

## Axes

| Axis | Motion | Hardware | Why |
| --- | --- | --- | --- |
| X, Y | gantry, 600 × 600 mm | donor frame, existing steppers | |
| Z | blade depth, ~40 mm travel | compact lead-screw stage on the head plate | grooves are partial-depth cuts; depth must be commanded, not set by hand |
| A | blade tilt, target ±50° | stepper + belt or harmonic reduction, axis through the blade tip | V-groove walls; ±45° covers every fold to 90°, margin for sharper |
| C | tangential swivel, continuous | hollow-shaft stepper around Z | an ultrasonic knife cuts along its edge; it must face the direction of travel |

Two geometric constraints matter more than anything else in the head design:

1. **The A axis must pass through the blade tip.** If the tilt pivot is above
   the tip, tilting translates the cutting point sideways and every tilted cut
   lands off its programmed line by `pivotHeight × sin(tilt)`. Design the
   linkage so the virtual pivot sits at the tip, or the post-processor must
   compensate — avoidable complexity.
2. **The C axis should be coaxial with the blade shaft.** Swivel then changes
   heading without moving the tip.

The knife: a 20–40 kHz ultrasonic transducer with a blade horn (the modules
sold for ultrasonic food/foam cutting work; 30–50 W class). Ultrasonic assist
is what lets a knife cut 6–10 mm EVA cleanly at speed without dragging.

## Controller

**Primary: grblHAL on a Teensy 4.1** with a 5-axis breakout board.

- grblHAL is maintained, genuinely handles 5 axes (X Y Z A C), and speaks
  standard G-code — which is why `machine/gcode.ts` targets it.
- Teensy 4.1 (600 MHz Cortex-M7) sustains high step rates with all five axes
  interpolating, which belt X/Y at cutting feeds plus two rotaries need.
- M3/M5 with the spindle output gates the ultrasonic driver through a
  solid-state relay; S maps to amplitude where the driver supports it.
- Alternative: **LinuxCNC** on a small PC accepts the same files (the post
  emits conservative RS274). FluidNC (ESP32) also runs 5 axes if WiFi-first
  setup is preferred; grblHAL remains the recommendation for step-rate
  headroom.

Drivers: TMC2209 (X/Y/C) and TMC5160 if the Z/A reductions need current.
24 V PSU for motion; the ultrasonic driver runs from its own supply with the
SSR in its AC side. Endstops on X/Y/Z, a homing index on A and C, and a
hardware E-stop that kills both PSUs — the software assumes none of this, it
is safety, not control.

## Overhead camera

A fixed USB camera above the bed, any 1080p module. The loop it enables:

1. Foldcraft's SVG sheets carry four corner fiducials
   (`exportSvg`, `#registration` layer; positions from `expectedFiducials()`).
2. The camera locates them in pixel space (circle detection — OpenCV or
   similar; outside Foldcraft's scope).
3. `homographyFromPairs()` maps camera pixels → bed millimetres;
   `registrationErrorMm()` says whether the calibration is trustworthy
   (re-detect above ~1 mm).
4. Uses: find a hand-placed sheet without jigs; **re-find the sheet after
   flipping it** for grooves on the opposite face (mountain folds groove the
   inside, valley folds the outside — a flip is routine, not exceptional);
   verify mid-job that the sheet has not shifted.

A homography absorbs the perspective of a camera that is not perfectly
perpendicular, which a bracket-mounted camera never is.

## What the software already enforces

The simulator (`machine/simulator.ts`) runs the exact toolpath IR the G-code
is generated from, and rejects:

- travel outside the 600 × 600 bed,
- tilt beyond the A axis range,
- cuts deeper than stock + overcut,
- **rotating a buried blade** — tilt or swivel changes while the tip is in
  the material, the failure mode that snaps ultrasonic blades. The toolpath
  planner lifts at corners because of this rule; the ordering "grooves first,
  outlines last" is likewise built into the planner so panels stay anchored
  until nothing else needs them.

Two `MachineProfile` numbers are placeholders until the machine is measured:
**tilt range** (assumed ±45°) and **kerf** (assumed 0.3 mm). Update
`ULTRASONIC_TILT_MACHINE` in `packages/foldcraft/src/foldcraftTypes.ts` when
real values exist; `requiredBladeTiltDeg()` reports what your actual models
demand from the tilt axis.

## Builder's responsibility

This document is a design intent record, not a certified machine design. Frame
stiffness under side load from the knife, tilt-axis backlash under cutting
force, transducer mounting resonance, guarding, electrical protection, and
E-stop category are engineering that happens at the machine, by someone
qualified — as the existing CNC inventory notes in
[FABRICATION_STUDIO.md](FABRICATION_STUDIO.md) already state for the
five-axis foam cutter.
