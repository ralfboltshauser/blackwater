# Blackwater UI Blueprint

Status: planning-state blueprint, 11 July 2026

The revised TV and phone images use the exact state in
[`canonical-round4-state.json`](./canonical-round4-state.json). That JSON, not
text invented inside an image, is the canonical source for implementation.

## Blueprint scope

The two hero mocks cover one synchronized moment:

- six-player match;
- Round 4 of 7;
- Open Water planning;
- 01:28 remaining;
- three of six players locked;
- Cyan is one public Network step from victory;
- Amber is editing a legal private three-Pulse program.

They define visual hierarchy, information placement, state grammar, and art
direction. They do not pretend that one planning screenshot also specifies every
Forecast, Resolution, Intel, Deal, reconnect, or result state.

Approved images:

- [`mocks/tv-planning-final.png`](./mocks/tv-planning-final.png)
- [`mocks/phone-landscape-commands-final.png`](./mocks/phone-landscape-commands-final.png)

## Corrections from the first mocks

| Before                                          | After                                                                                             | Why                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Six players on a 13-sector four-player basin    | Six players on a 19-sector stress-test basin                                                      | The definitive TV blueprint must prove the maximum supported count                 |
| Rails claim 4–7 platforms                       | Rails show two or three exact module glyphs, never above the four-platform cap                    | The original state was mechanically impossible                                     |
| Nearly every sector looks prebuilt              | Empty sectors use small terrain/build anchors; only 13 constructed platforms use physical sprites | Expansion must remain visually meaningful                                          |
| Neutral identical platforms                     | Owner collar + emblem/pattern + Extractor/Sonar/Lab module glyph                                  | Ownership and module are public strategy facts                                     |
| Only two Arks                                   | Six owner-marked Arks                                                                             | Every Ark is always public                                                         |
| Decorative Victory Watch beads                  | Network/Discovery/Dominion rows, named Threat, and `OPEN COMMISSION +1`                           | Players need to know why the leader matters                                        |
| Huge planning-time event banner                 | Compact bottom phase/ticker rail                                                                  | Negotiation needs a stable map                                                     |
| Generic contacts                                | Confidence ring, age, heading/wake, identified owner when known                                   | Hidden movement must support deduction                                             |
| Three decorative operation cards                | Compact three-Pulse stepper plus one detailed editor                                              | Decisions, costs, and dependencies matter more than card artwork                   |
| Portrait-first controller                       | Landscape field console with portrait fallback                                                    | Map, three Pulses, and editor stay visible together and align with the TV topology |
| Glide/Survey/Harvest spend Supply incorrectly   | Glide: 1 Silence; Survey: 1 Signal; Harvest: 1 committed Signal                                   | Every displayed cost must match the resolver                                       |
| Whole plan says `NO PUBLIC WAKE`                | Per-Pulse trace plus overall warning that Pulses 2–3 reveal activity                              | The original message dangerously overstated secrecy                                |
| No selected asset                               | `SUB A-1 · Integrity 2/2 · Cargo 0/2 · Silence 2/2`                                               | Operations belong to assets                                                        |
| Padlock implies irreversible commit             | `LOCK & READY` plus `Editable until 0:00`                                                         | Locking remains reversible during planning                                         |
| Heavy textured frame around every phone element | Texture concentrated in map; functional controls use quieter surfaces                             | Hierarchy and thumb readability matter more than ornament                          |

## Shared visual system

### Production medium

- Browser-rendered UI, not a painted full-screen image
- Baked bathymetric field plus independent runtime layers
- Blender-made low-poly orthographic equipment sprites
- SVG/Pixi tactical lines, status marks, and icons
- React DOM typography and controls

### Palette

| Token           | Value     | Use                                      |
| --------------- | --------- | ---------------------------------------- |
| `water.deep`    | `#071F26` | Basin and deepest UI surfaces            |
| `water.mid`     | `#0B3740` | Raised panels and depth regions          |
| `contour`       | `#2A6870` | Low-contrast bathymetry                  |
| `text.primary`  | `#F2F0E4` | Essential labels and values              |
| `text.muted`    | `#9AB0AE` | Secondary timestamps and explanations    |
| `shared.orange` | `#FF9D52` | System attention, not hostility          |
| `bio.mint`      | `#7BE0CE` | Sonar, discovery, confirmed system state |
| `amber`         | `#F0A51B` | Amber seat/ownership only                |

Six seat colors always pair with an emblem and a texture/pattern. Red is not the
universal enemy color.

### Typography

- IBM Plex Sans for labels, body, numbers, and controls
- IBM Plex Mono only for `R3/P2`, coordinates, and terse telemetry
- Condensed display lettering only for the BLACKWATER wordmark and rare event headings
- TV map labels: 28–34 px at the 1920×1080 logical scene
- TV critical state: 36–48 px
- Phone essential text: 15–17 CSS px
- Phone secondary telemetry: never below 13 CSS px

### Tactical grammar

| State                 | Mark                                                           |
| --------------------- | -------------------------------------------------------------- |
| Empty build site      | Small neutral anchor ring; no physical platform sprite         |
| Active platform       | Filled equipment sprite + owner collar/pattern + module glyph  |
| Disabled module       | Interrupted outer ring + crossed module glyph                  |
| Contested platform    | Current-owner collar plus contender wedge; `TRANSFER R4` chip  |
| Ark                   | Public sprite with owner stripe and emblem                     |
| Unknown contact       | Hollow ring; arc length communicates confidence                |
| Identified contact    | Filled owner mark inside contact ring                          |
| Public wake           | Directional dotted taper with observation age                  |
| Neutral topology      | Thin dark-teal line with a darker halo                         |
| Threat network        | Owner-colored highlighted links, only for the threatened route |
| Private planned route | Dashed seat-colored path; phone only                           |

## TV blueprint

### Logical frame

- Canvas: 1920×1080
- Overscan-safe content: x `96–1824`, y `54–1026`
- Top status bar: y `54–136`
- Left rail: x `96–310`, y `152–930`
- Public map: x `330–1590`, y `152–930`
- Right rail: x `1610–1824`, y `152–930`
- Phase/ticker strip: x `96–1824`, y `946–1026`

The map remains roughly 67% of total screen area after the six-player stress
rails. At four players the map expands; cards do not simply grow.

### Header

Show, in descending priority:

1. `ROUND 4 / 7`
2. `OPEN WATER`
3. `01:28`
4. `3 / 6 LOCKED`
5. compact Victory Watch:
   - `NETWORK · CYAN 3/4 · THREAT`
   - `DISCOVERY · VIOLET 2 / NO LAB · CORAL 2 / NO LAB`
   - `DOMINION · SEALED UNTIL CLAIM CHECK`
   - `OPEN COMMISSION · +1 SUPPLY ON CYAN`

Do not imply exact private Discovery types or Dominion positions.

### Player card

Each of the six cards contains:

- seat color, emblem, and `seat · faction` name;
- public Supply;
- owned modules as actual glyphs: Extractor, Sonar, Laboratory;
- analyzed count;
- `PLANNING`, `LOCKED`, or `RECONNECTING`;
- Threat/Commission only where applicable.

No generic platform number is larger than the faction identity. Modules are more
useful than a count because they explain income and Charter eligibility.

### Public basin

The screen uses all 19 canonical sectors and three marked Deep Sites. Whole
sectors are never tinted as territory. Runtime ownership belongs only to assets.

The Round 4 map must visibly include:

- all six Arks;
- Cyan's connected `Extractor 2 → Sonar 7 → Lab 8` Network threat and Ark at 13;
- Violet's disabled Sonar at 12, Contested by Lime, transfer-eligible this check;
- Lime's identified contact and fading `11 → 12` wake;
- anonymous partial-confidence contact at 14 and fading `18 → 14` wake;
- specimen availability at Deep Sites 12, 13, and 18;
- no Amber submarine, trap, or private route.

Contour contrast drops about 25% beneath topology/evidence. Routes and wakes use
dark halos. Bright cyan/mint is reserved for meaningful active evidence.

### Bottom strip

Persistent phase progression:

`PLAN → PULSE 1 → PULSE 2 → PULSE 3 → CHARTER CHECK`

`PLAN` is active. A compact ticker may read `DEEP SITES REPLENISHED`; it never
becomes a permanent hero banner during planning.

## Phone Commands blueprint

### Viewport

- Primary target: landscape 844×390 CSS px
- Required tests: 667×375, 700×360, 812×375, 932×430, emergency 640×320
- Minimum touch target: 44 px; prefer 48 px
- Use `100svh`, `100dvh`, `viewport-fit=cover`, and all four safe-area insets
- Keep interactive map gestures 24–32 px away from OS edge gestures
- Landscape is preferred, never technically required; portrait stacks the same
  components and recommends rotation

### Landscape hierarchy

```text
┌ Amber · Hadal │ R4/7 · Open Water · 01:28 │ Sup 4 · Sig 3 · Sil 2 │ ◉ ┐
├──────────────── PRIVATE MAP 56% ─────────────┬──── WORK PANE 44% ──────┤
│ asset rail │ north-up 5–7-sector crop        │ Commands · Intel 2 · Deal 1│
│ ARK        │ Sub A-1 + private route         │ [P1] [P2] [P3]             │
│ SUB A      │ public platforms/evidence       │ selected Pulse editor       │
│ PLATFORMS  │ private Snare/intel annotation  │ cost · trace · outcome       │
├──────────────────────────────────────────────┴───────────────────────────┤
│ Now → projected resources │ P1 hidden; P2–3 public @ Site 2 │ LOCK & READY │
└──────────────────────────────────────────────────────────────────────────┘
```

- Outer rows: `44px minmax(0, 1fr) 56px`
- Workspace columns: `minmax(360px, 1fr) minmax(288px, 0.82fr)`
- At 844 px: about 420 px map region and 320 px planner after safe areas
- Asset rail: 60–68 px inside the map pane; scroll only when necessary
- Commands/Intel/Deals: top segmented switch inside the working pane
- Pulse stepper: 52–56 px; all three remain visible
- Only the selected Pulse expands; draft changes save immediately
- The footer always retains projected resources, full-plan exposure, and Lock
- At compact heights, remove decorative spacing and illustration before reducing text
- No bottom navigation and no giant operation-card illustrations

### Exact Amber state

Header/resources:

- `ROUND 4 / 7 · OPEN WATER · 01:28`
- `AMBER · HADAL ENGINEERS`
- current: `SUPPLY 4 · SIGNAL 3 · SILENCE 2/2`
- selected: `SUB A-1 · INTEGRITY 2/2 · CARGO 0/2`
- privacy-eye control and connected indicator

Pulse stepper:

1. `P1 · SUB A-1 · GLIDE → SITE 2 · SILENCE −1 · NO TRACE`
2. `P2 · SUB A-1 · SURVEY @ SITE 2 · SIGNAL −1 · PUBLIC CONTACT`
3. `P3 · SUB A-1 · HARVEST @ SITE 2 · COMMIT SIGNAL 1 · PUBLIC CONTACT`

Selected Pulse 1 editor:

- route `EASTERN RIFT → BLACKWATER SITE 2`;
- Silent Running toggle ON;
- cost `1 SILENCE`, not Supply;
- deterministic result `ARRIVE AT SITE 2 IF ROUTE REMAINS OPEN`;
- per-Pulse trace `NO WAKE THIS PULSE`;
- overall warning `SURVEY + HARVEST REVEAL ACTIVITY AT SITE 2`;
- projected remainder `SUPPLY 4 · SIGNAL 1 · SILENCE 1`;
- auto-saved draft state plus Clear/Change affordances.

Primary action:

- `LOCK & READY`
- helper `Editable until 0:00`
- after locking, replace the editor with `PLAN LOCKED · WATCH THE BASIN`, plus
  `REVIEW` and `UNLOCK`.

### Private map

The tactical crop uses exactly the TV's north-up geometry around sectors 8, 9,
13, and 14. It adds only Amber-authorized layers:

- exact `SUB A-1` at Eastern Rift;
- dashed planned route to Blackwater Site 2;
- own armed `SNARE · TAG` at Brine Gallery; no corresponding TV mark;
- private annotation on the public contact at 14: `PROBABLE CHALK · 70%`;
- sealed report metadata `R3/P2 · SUBMERSIBLE · HEADING NE`;
- clearly unverified Statement `CORAL: “SITE 2 IS CLEAR”` available under Intel;
- public platforms using the same owner/module grammar as TV;
- `1 SPECIMEN AVAILABLE · TYPE UNKNOWN` at Site 2.

Unknown contacts preserve their underlying public ring; private confidence,
source, and time appear as an added annotation rather than a different symbol.

### Agreements, Intel, and Deals

- The public Cyan–Amber Handshake appears as a compact active-obligation chip.
- `INTEL 2` replaces the right editor when opened while the local map remains.
- `DEALS 1` opens Coral's private offer: pay 1 Signal for sealed Site 2 packet
  metadata whose contents unlock only after acceptance.
- No pending-offer mark appears on the TV.
- Footer exposure/resources and Lock remain visible while browsing Intel or Deals.

### Orientation and privacy

Attempt fullscreen/orientation lock only after a user gesture and tolerate failure.
Never CSS-rotate the application. In portrait, show a nonblocking `Rotate for the
full field console` recommendation above a functional stacked layout.

Landscape exposes more screen to neighbors. After 6–8 seconds idle, the optional
privacy mode atomically hides secret layers/cards, then may fade in an opaque
patterned veil while public geography and navigation remain visible. One tap
reveals them. Lock immediately hides private detail and
shows `PLAN LOCKED · WATCH THE BASIN`.

## Interaction and motion requirements

- Press feedback begins on pointer-down around `scale(0.97)`.
- Route dragging tracks the finger 1:1, captures the pointer, and rubber-bands
  beyond legal edges; tap-to-select remains available.
- Pulse changes use 150–220 ms interruptible transitions.
- The selected editor originates from the selected Pulse tab.
- Lock is reversible until the deadline and never waits for a decorative animation.
- Once locked, the phone becomes visually quiet and directs attention to the TV.
- Reduced motion replaces map travel and springs with short crossfades.
- Browser vibration is optional and never the sole feedback channel.

## Additional states required before implementation is called complete

The same components must later specify:

- TV: Forecast, each resolution Pulse, conflict focus, Charter check, victory,
  reconnect/pause;
- phone: no orders, invalid dependency, full plan review, locked, Intel, report
  forward/redaction/Statement, Deals, incoming offer, reconnect, private result,
  Field Record.

These are component states, not separate art directions.
Their implementation scope is not identical: the Core/Alpha/Deferred schedule in
[`../VISUAL_PRODUCTION_PLAN.md`](../VISUAL_PRODUCTION_PLAN.md) keeps general
Contract language and other Alpha finish work off the pre-playtest critical path.
