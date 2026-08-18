# Foldcraft cutter — build requirements

Everything needed to build the machine Foldcraft drives: the controller
decision, axis specifications derived from real cut data, firmware
configuration, the complete G-code contract, and commissioning.

Companion documents: [FOLDCRAFT_MACHINE.md](FOLDCRAFT_MACHINE.md) (design
intent) and [FOLDCRAFT.md](FOLDCRAFT.md) (the software).

**Status: specification, not a certified design.** Structural, electrical, and
safety engineering is the builder's responsibility. Every price is indicative
and every part needs checking against current availability.

---

## 1. The controller question: can the stock board be hacked?

**No. It must be replaced.** The MCU is not the obstacle — the PCB is.

### What is in the donor machine

Best available identification of the TwoTrees TTS-55 Pro mainboard. **Confirm
by opening the case and reading the silkscreen before buying anything** —
this could not be verified from a photographed teardown.

| Property | Finding | Confidence |
| --- | --- | --- |
| Board | MKS **LS ESP32 PRO** V1.x/V2.x | Medium |
| MCU | ESP32 or ESP32‑S3 (a V1.1 report says S3; retail V2.x pages say plain ESP32) | Medium‑low |
| Motors fitted | **3** — 1× X, 2× Y ganged | High |
| Motor channels on PCB | **4 max** — X, Y1, Y2, and an unpopulated Z | Medium‑high |
| Stepper drivers | TMC2209 **soldered on-board**, no external step/dir header | Medium |
| Firmware | Grbl_ESP32 → Makerbase MKS‑DLC32 fork → TwoTrees "LKS_…" build | High |
| Bootloader | Not locked; flashable via esptool / MKS ESP32 Download Tool | Medium‑high |

### Why it cannot be made to work

The machine needs **six motor outputs**: X, Y1, Y2, Z, A, C. The board has at
most four channels, and on the Pro board those drivers are surface-mounted with
no breakout to escape to external drivers. Three independent obstacles, any one
of which is fatal:

1. **No fifth or sixth driver exists**, and none can be added.
2. **No external step/dir header** — unlike the non‑Pro MKS DLC32, which has
   one. There is no escape route to bigger external drivers.
3. **No published schematic or pinout**, and no FluidNC or grblHAL board map
   for the LS ESP32 PRO. Reflashing means buzzing out an undocumented board
   with a meter. If it is an ESP32‑S3, grblHAL's RMT step generation caps it
   at four motors regardless.

For completeness: classic GRBL 1.1 is hard-coded to three axes. FluidNC and
grblHAL both support six, so firmware alone was never the limit.

### Recommended replacement

| Option | Platform | Axes | Drivers | ~Price | Verdict |
| --- | --- | --- | --- | --- | --- |
| **T41U5XBB + Teensy 4.1** (Brookwood Design, grblHAL) | iMXRT1062 @600 MHz | **5** | external | $34 board + ~$33 Teensy | **Recommended.** Isolated I/O, 7 relay outputs, 0–10 V analog for the cutter generator, step rate headroom for five interpolated axes |
| BTT SKR PRO v1.2 (grblHAL) | STM32F407 | **6** | 6 **socketed** | ~$50–70 | Cheapest credible option; drivers replaceable per axis. Good fallback |
| Jackpot (FluidNC, V1 Engineering) | ESP32 | **6** | 6 socketed TMC2209 | ~$90–120 | Friendliest plug-and-play; in stock |
| LinuxCNC + Mesa 7i96S | PC + FPGA | 5+ | external | ~$250 + PC | **The only option with real 5-axis kinematics** — see §5 |
| Duet 3 Mini 5+ (RRF) | SAME54 | 9 | mixed | ~$150–190 | Mature, but pricier for no gain here |
| Klipper | Pi + MCU | many | — | — | **Not suitable.** Printer-oriented; no CNC G-code dialect or rotary CAM workflow |

**Build recommendation: T41U5XBB + Teensy 4.1 + external drivers.** Foldcraft's
post-processor targets grblHAL and emits conservative RS274, so LinuxCNC runs
the same files unmodified if you later migrate.

---

## 2. Donor machine: keep or replace

| Subsystem | Action | Note |
| --- | --- | --- |
| Frame, 600 mm extensions | **Keep** | Verify stiffness under side load — a knife pushes sideways; a laser never did |
| X/Y rails, belts, carriages | **Keep** | Inspect belt tension and backlash; consider linear rails on X if deflection shows |
| X/Y steppers | **Keep initially** | Re-evaluate if the head mass exceeds ~1.5 kg |
| Laser module + driver | **Remove** | |
| Mainboard | **Replace** | §1 |
| 24 V PSU | **Reuse if rated** | Recalculate for 6 motors; add a separate supply for the cutter |
| Limit switches | **Keep, add Z/A/C homing** | |

---

## 3. Axis requirements — derived from real cut data

These are not guesses. They come from running Foldcraft's post-processor over a
120 mm faceted cube and a 280 mm helmet shell in 6 mm EVA foam.

| Axis | Motion | Range | Resolution needed | Why that number |
| --- | --- | --- | --- | --- |
| X, Y | gantry | 600 × 600 mm (580 usable) | ±0.1 mm | Panel edges must meet at assembly |
| **Z** | blade depth | 0 to −40 mm | **±0.1 mm** | Hinge is 0.5 mm of a 6 mm sheet. ±0.1 keeps it in 0.4–0.6 mm; ±0.3 either severs the hinge or leaves it too thick to fold |
| **A** | blade tilt | **±50°** | **±0.5°** | Groove angle = 2× tilt error, and fold error accumulates across a panel chain. ±45° covers every fold down to a right angle; ±50° gives margin |
| **C** | swivel | continuous, ≥±180° | ±1° | Blade must face along travel; error causes tearing rather than cutting |

### Verified from the software

Running a 120 mm cube through the real pipeline:

```
distinct A values emitted : -45, 0, 45
distinct C values emitted : -180, -90, 0, 90, 180
Z range                   : 0 to -6.3 mm  (5.5 groove, 6.3 through-cut)
feed                      : F600 mm/min
total cut length          : 2880 mm  (~4.8 min at F600)
```

A 280 mm helmet shell across 2 sheets: 7461 mm of cutting — 12.4 min at F600,
6.2 min at F1200.

### Two findings worth acting on

**The tilt axis is for hard edges, not curved shells.** On a smoothly faceted
hemisphere every fold lands between 156° and 167°, and Foldcraft turns anything
above 150° into a plain **score line** — the foam simply bends. That job used
the A axis not at all. The tilt axis earns its keep on boxy props and armour
with defined edges. **If the A axis proves hard to build well, a 3-axis
(XYZ + C) machine already cuts a large class of real work.** Build A second.

**Groove width is substantial.** A 90° fold in 6 mm foam needs an **11 mm**
opening; the widest groove the planner will now emit is 30.2 mm (at the 40°
through-cut threshold). Plan chip/waste clearance accordingly.

---

## 4. Mechanical requirements

### The one constraint that matters most

> **The A (tilt) axis must pivot through the blade tip.**

If the pivot sits above the tip, tilting translates the cutting point sideways
by `pivotHeight × sin(tilt)` — at 45° with a 30 mm offset that is **21 mm of
error**. No GRBL-family firmware compensates for this. Either:

- **(a)** design the linkage so the virtual pivot is at the tip — preferred; or
- **(b)** accept the offset and add tip compensation to the post-processor —
  Foldcraft does **not** do this today (see §9 open items); or
- **(c)** use LinuxCNC's `5axiskins`, the only open-source kinematics that
  solves a tilting head properly.

Likewise, **C should be coaxial with the blade shaft** so swivel does not move
the tip.

### Head assembly

| Item | Requirement |
| --- | --- |
| Z stage | Lead screw (T8) or ball screw, ≥40 mm travel, minimal backlash |
| A drive | Stepper + reduction (belt or harmonic), ≥±50°, backlash < 0.5° |
| C drive | Hollow-shaft stepper or belt-driven ring, continuous rotation |
| Head mass | **Keep under ~1.5 kg** — see §5 |
| Homing | Index/switch on Z, A, and C. A and C must home repeatably or every job starts mis-oriented |

---

## 5. The cutting head — reconsider ultrasonic

The research turned up a substantive challenge to the ultrasonic plan. Both
points are worth weighing before committing money:

**Mass.** A 20 kHz ultrasonic stack is converter + booster + horn, roughly
300 mm long; a booster alone is ~0.55 kg and a full stack runs **1.5–3 kg**.
Hanging that off Z + A + C, on a diode-laser gantry designed for a ~0.5 kg
laser module and now stretched to 600 mm, is a serious structural problem.
35–40 kHz stacks are physically smaller and are the sensible choice if you do
go ultrasonic.

**Fitness for EVA.** Suppliers of foam-cutting equipment consistently
recommend a **mechanical oscillating (reciprocating) knife** for EVA/EPE/XPE —
a cold shearing action that avoids thermal deformation. Ultrasonic's
distinctive benefit is a **sealed, melted edge**, which for cosplay EVA is
arguably a *defect* rather than a feature, and it complicates gluing.

> **Recommendation: price a mechanical oscillating knife head before buying an
> ultrasonic stack.** It is dramatically lighter, cheaper, and safer, and drops
> into the identical XYZAC architecture — Foldcraft's toolpaths do not change.

If ultrasonic is still wanted:

| Tier | Spec | ~Price | Note |
| --- | --- | --- | --- |
| Hobby handheld (EchoTech ZO‑30 clones) | 40 kHz, 30–40 W | $60–150 | **Intermittent duty**; not built for gantry mounting or continuous CNC use |
| Industrial set (RPS‑Sonic, Altrasonic, Sino Sonics) | 20–40 kHz, 500–1200 W, generator + transducer + horn | ~$200–800, quote-driven | The realistic CNC category; marketed for machine integration |
| Western industrial (Telsonic, Sonotronic, Dukane) | 20–35 kHz | Quote only | Best engineering, worst budget fit |

**Switching from the controller**, in order of preference:

1. **On/off via spindle output** — `M3`/`M5` drives a relay or opto into the
   generator's remote start/stop (24 V logic or dry contact). This is what
   Foldcraft's post emits.
2. **Amplitude via 0–10 V analog** — better generators accept a remote
   amplitude signal; wire to the controller's analog spindle output, driven by
   the `S` word. The T41U5XBB and Mesa 7i96S both provide this.
3. **Raw PWM into the generator** — avoid; generators expect analog or contact
   closure.

---

## 6. Electronics

| Item | Spec |
| --- | --- |
| Controller | T41U5XBB + Teensy 4.1 (§1) |
| Drivers | External step/dir. TMC2209/2226 (quiet, ~2 A) for X/Y/C; TMC5160 or DM542-class if Z/A reductions demand torque |
| Motion PSU | 24 V, sized for 6 motors + margin |
| Cutter PSU | **Separate supply**, switched through an SSR on its AC side |
| Endstops | X, Y, Z min; index sensors on A and C |
| E-stop | Hardware, category-appropriate, **killing both PSUs** — not a firmware feature |
| Cable | Shielded, in drag chain. A generator's HV lead in a flexing chain needs proper spec |

---

## 7. Firmware: grblHAL

### Axis mapping

| Letter | Function | Type |
| --- | --- | --- |
| X, Y | gantry | linear, mm |
| Z | blade depth (0 = surface, negative into stock) | linear, mm |
| **A** | blade tilt from vertical | rotary, degrees |
| **C** | tangential swivel = heading of travel | rotary, degrees |

### Build configuration

- grblHAL core with `N_AXIS = 5`, Teensy 4.1 (iMXRT1062) driver, T41U5XBB board map.
- Enable: rotary axes A and C, spindle enable + PWM/analog output, homing on all five.
- **Set A and C as rotary** so their steps/mm are interpreted as steps/degree.

### Settings to establish at commissioning

```
$100/$101   X/Y steps/mm          from belt pitch × pulley teeth × microsteps
$102        Z steps/mm            lead screw pitch × microsteps
$103        A steps/degree        reduction ratio × microsteps ÷ 360
$105        C steps/degree        reduction ratio × microsteps ÷ 360
$110-$115   max rate per axis     A and C in deg/min
$120-$125   acceleration
$130/$131   X/Y max travel        600 / 600
$132        Z max travel          40
$133/$135   A/C max travel        A: 100 (±50); C: continuous or 360
$30/$31     spindle max/min       S-word range for the cutter generator
```

### Firmware capability caveats

- **No GRBL derivative implements tangential auto-swivel.** FluidNC's feature
  request for it was closed unimplemented. Foldcraft therefore emits every C
  angle explicitly — which is the correct and expected arrangement.
- **No GRBL derivative compensates a tilting-head kinematic chain.** See §4.
- LinuxCNC alone offers `5axiskins` (tilting head) and `tangentkins`
  (experimental auto-swivel). Reserve it for if §4(a) proves impossible.

---

## 8. G-code contract

Foldcraft's post-processor
(`packages/foldcraft/src/machine/gcode.ts`) emits a deliberately small dialect.
**The complete set of codes, verified by running a real job:**

| Code | Use | Notes |
| --- | --- | --- |
| `G21` | millimetre units | header, once |
| `G90` | absolute positioning | header, once |
| `G94` | units-per-minute feed | header, once |
| `G0` | rapid — travel, retract, **and blade orientation** | never cuts |
| `G1` | feed move — plunge and cut | always carries `F` |
| `M3 Sxxx` | cutter on, amplitude via `S` | header |
| `M5` | cutter off | footer |
| `M2` | program end | footer |

Nothing else. No arcs (`G2`/`G3`), no canned cycles, no work offsets, no tool
changes, no subroutines. Any controller that handles these eight codes with
five axes runs Foldcraft output.

### Verified output — real, from a 120 mm cube

```gcode
(foldcraft — sheet 1)
(machine: Ultrasonic tilting knife (600 × 600))
(axes: X Y gantry mm, Z depth mm, A tilt deg, C swivel deg)
G21 (mm)
G90 (absolute)
G94 (units per minute feed)
G0 Z6
M3 S1000 (ultrasonic on)
(panel P1 grooves)
G0 X250 Y130          ; travel, blade up
G0 A45 C90            ; orient BEFORE plunging — first V-groove wall
G1 X250 Y130 Z-5.5 F600
G1 X250 Y250 Z-5.5 F600
G0 Z6                 ; lift
G0 X250 Y130
G0 A-45 C90           ; second wall, opposite tilt
G1 X250 Y130 Z-5.5 F600
G1 X250 Y250 Z-5.5 F600
G0 Z6
...
(panel P1 outline)
G0 X250 Y130
G0 A0 C0              ; blade vertical for through-cuts
G1 X250 Y130 Z-6.3 F600
G1 X370 Y130 Z-6.3 F600
G0 Z6
...
G0 Z6
M5 (ultrasonic off)
G0 X0 Y0
M2
```

### Invariants the machine can rely on

1. **Orientation happens with the blade retracted.** `A` and `C` are only
   commanded in `G0` moves while `Z` is at clearance. Rotating a buried blade
   tears foam and snaps blades; Foldcraft's simulator rejects any toolpath that
   does it, and the toolpath planner lifts at every corner where heading changes
   for exactly this reason.
2. **Grooves and scores cut before outlines.** All partial-depth work happens
   while panels are still anchored by the surrounding sheet; through-cuts run
   last.
3. **Z is never positive while cutting.** 0 is the stock surface; cuts are
   negative. Through-cuts go to thickness + 0.3 mm overcut.
4. **Every `G1` carries an explicit `F`.**
5. **Depth never exceeds stock + overcut**, and **tilt never exceeds the
   profile's `maxBladeTiltDeg`** — both enforced by the simulator before a file
   is written.

### Pre-flight simulation

Every job is simulated against the machine profile before export, rejecting:
bed overrun, tilt beyond the axis, cuts deeper than the stock, swivel on a
machine without a C axis, and buried-blade rotation. The simulator executes
*the same* toolpath IR the G-code is generated from, so a passing simulation
describes the file that was actually written.

---

## 9. Known software limitations

Honest list of what Foldcraft does **not** do yet, all relevant to this build:

1. **No tool-tip compensation for A-axis offset.** The post assumes the tilt
   pivot is at the blade tip (§4). If the built machine has an offset, either
   fix it mechanically or this must be added.
2. **C angles are not shortest-path normalised.** The post emits both `-180`
   and `180`, so the C axis can be commanded a full turn where a small one
   would do. Harmless on a continuous rotary, wasteful in time. A normalisation
   pass is a small change once real hardware shows the cost.
3. **No lead-in/lead-out moves.** The blade plunges vertically at the start of
   each cut. Foam tolerates this; if the real head does not, ramped entry needs
   adding.
4. **Feeds are a single constant** (F600 default), not per-operation. Groove
   passes and through-cuts may want different feeds.
5. **Shelf packing, not true nesting.** Material use is not optimal.

---

## 10. Overhead camera

| Item | Spec |
| --- | --- |
| Camera | Any 1080p USB module, fixed mount above the bed, full-bed view |
| Fiducials | Four per sheet, drawn by Foldcraft in the SVG `#registration` layer |
| Calibration | Locate fiducials → `homographyFromPairs()` → camera pixels to bed mm |
| Tolerance | Re-detect above ~1 mm reprojection error (`registrationErrorMm()`) |

Uses: find a hand-placed sheet without jigs; **re-find it after flipping** for
grooves on the opposite face (mountain folds groove the inside, valley folds
the outside — flipping is routine); verify mid-job that the sheet has not
shifted. Fiducial detection itself (circle finding) is outside Foldcraft.

---

## 11. Commissioning order

1. **Mechanical** — frame square, rails true, belts tensioned; measure gantry
   deflection under a lateral load representative of the knife.
2. **Motion, dry** — no cutter fitted. Home all five axes; verify direction
   signs; calibrate `$100–$105` by commanding known moves and measuring.
3. **A/C accuracy** — command 0/±45° repeatedly, measure with a digital angle
   gauge; confirm backlash under 0.5°.
4. **Tip offset** — measure how far the tip moves between A=0 and A=45°. This
   number decides §4(a) vs (b) vs (c). **Do this before cutting anything.**
5. **Cutter, off-machine** — bench-test the head, confirm remote start/stop and
   amplitude control.
6. **First cuts** — scrap foam. Calibrate `hingeMm` by cutting scores at
   several depths and folding them.
7. **Groove calibration** — cut 90°, 120°, 150° test folds; measure achieved
   angles; adjust `hingeMm` and `kerfMm` in `ULTRASONIC_TILT_MACHINE`.
8. **Camera** — calibrate the homography; verify under 1 mm.
9. **First real part** — a small boxy prop (exercises true V-grooves) before a
   curved shell (mostly scores).

### Software values to update after commissioning

In `packages/foldcraft/src/foldcraftTypes.ts`:

```ts
ULTRASONIC_TILT_MACHINE = {
    bedWidthMm: 600, bedHeightMm: 600,
    maxBladeTiltDeg: 45,   // ← measured A range
    kerfMm: 0.3,           // ← measured blade kerf
    ...
}
DEFAULT_MATERIAL = {
    thicknessMm: 6,
    hingeMm: 0.5,          // ← calibrated by test folds
    ...
}
```

`requiredBladeTiltDeg(panels, material)` reports the tilt a given model
actually demands — use it on real parts to size the A axis from evidence.

---

## 12. Safety

**Ultrasonic-specific**, if that path is taken:

- **Blade jump** — ultrasonic collapses cutting resistance, so the blade
  advances faster and further than expected. Feed and plunge limits matter more
  than on a router.
- **Hot horn** — the assembly gets hot enough to burn; the common injury is at
  blade changes after heavy cutting. Add a cooldown step to shutdown.
- **Noise** — the ultrasound itself is not the hazard; audible subharmonics
  are. Measure at the operator position and set hearing protection from the
  measurement, not from assumption.
- **Standoff** — industry guidance keeps operators 500–750 mm from a live horn.
  An enclosed 600 mm machine suits this; add an **interlocked lid**.
- **Mount only at the booster's nodal ring.** Clamping elsewhere absorbs
  energy, wrecks efficiency, and can crack the stack.

**General:** hardware E-stop killing motion *and* cutter supply; guarding
against the blade; drag-chain-rated shielded cable for any HV lead.

---

## 13. Indicative bill of materials

Controller and electronics only — frame and motion reused from the donor.

| Item | Qty | ~Cost |
| --- | --- | --- |
| Teensy 4.1 | 1 | $33 |
| T41U5XBB breakout | 1 | $34 |
| External stepper drivers | 6 | $60–180 |
| Z lead-screw stage | 1 | $30–60 |
| A tilt assembly (stepper + reduction) | 1 | $60–150 |
| C swivel (hollow-shaft stepper or ring drive) | 1 | $50–120 |
| Cutting head — oscillating knife | 1 | $150–400 |
| Cutting head — ultrasonic set (alternative) | 1 | $200–800+ |
| 24 V PSU | 1 | $30–50 |
| SSR, E-stop, endstops, wiring, drag chain | — | $60–120 |
| USB camera + mount | 1 | $25–60 |
| **Total (oscillating knife path)** | | **≈ $530–1,200** |

---

## 14. Open items

1. **Open the case and identify the actual board** before ordering. The
   identification in §1 is inferred, not photographed.
2. **Decide the cutting head** — oscillating knife (recommended) vs ultrasonic.
   This is the largest single decision and it drives head mass, PSU, and safety.
3. **Measure the A-axis tip offset** at commissioning and choose §4(a)/(b)/(c).
4. **Decide grblHAL vs LinuxCNC.** grblHAL if the pivot is at the tip;
   LinuxCNC if true tilting-head kinematics are needed.
5. Whether to build A at all in phase 1 — a XYZ+C machine already cuts curved
   shells, which are mostly scores and through-cuts (§3).
