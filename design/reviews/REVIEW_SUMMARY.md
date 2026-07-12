# Independent Blueprint Review

Date: 11 July 2026

Reviewed artifacts:

- `tv-planning-v1.png`
- `phone-commands-v1.png`
- `GAME_DESIGN.md`
- local implementation environment

## Verdict

The visual identity is strong. The first mocks were not mechanically or
technically safe as implementation blueprints. The revised direction is feasible
as a browser-rendered game using React, PixiJS, and offline Blender sprites.

Reviewer feasibility rating: approximately 8/10. Primary risks are state/UI
complexity and art consistency, not 1080p rendering performance.

Landscape is the preferred phone match layout because the private map, three
dependent Pulses, and selected editor can remain visible simultaneously. It is a
responsive preference, not a forced device orientation.

## Local capability check

| Capability     | Available                                       |
| -------------- | ----------------------------------------------- |
| Node           | 26.2.0 on host; production will pin Node 24 LTS |
| pnpm           | 11.11.0                                         |
| Docker         | 29.5.3                                          |
| Docker Compose | 5.1.4                                           |
| Blender        | 5.0.1                                           |
| Chrome         | 148                                             |
| GPU            | NVIDIA GTX 1080 plus Intel UHD 630              |
| Godot          | Not installed and not selected                  |

## Required corrections

| Before                           | After                                                  | Reason                             |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| Six players on 13 sectors        | Six-player target uses 19 sectors                      | Match the game's scaling rule      |
| Impossible 4–7 platform totals   | Exact module inventory, cap four                       | Keep visuals resolver-valid        |
| Sector nodes look like platforms | Separate empty anchors and constructed assets          | Preserve the meaning of building   |
| No platform ownership/module     | Owner collar, emblem/pattern, module glyph             | Public strategy must be readable   |
| Two visible Arks                 | Six public Arks                                        | Arks can never be hidden           |
| Decorative Victory Watch         | Three Charter rows, Threat, bounty                     | Explain leader pressure            |
| No Supply/analyzed/ready state   | Complete public player cards                           | Required couch information         |
| Invalid phone resource costs     | Silence/Signal costs from canonical fixture            | Prevent mock/rules divergence      |
| Whole plan marked secret         | Per-Pulse trace plus combined exposure                 | Survey/Harvest reveal activity     |
| Portrait decorative card stack   | Landscape map/editor split                             | Avoid scrolling and align topology |
| No trap/intel/deal evidence      | Private Snare, sealed report, Statement, pending Trade | Demonstrate information asymmetry  |
| Painted whole-screen target      | Baked terrain + independent runtime layers             | Make every state renderable        |

## Non-negotiable implementation constraints

- The TV receives only a public server projection.
- The phone receives public state plus that seat's authorized private overlay.
- Hidden future information is not preloaded for later animation.
- Every mark in a mock maps to a field in `canonical-round4-state.json`.
- Browser vibration is optional; iPhone haptics are not promised.
- Cross-device effects are approximately synchronized, not frame-perfect.
- Godot/live 3D is not required to reach the art target.
- Generated raster mocks specify target composition and treatment; coded
  responsive layouts and state fixtures remain the engineering authority.
