# Blackwater: The Pelagic Survey

Design plan v0.1 — 10 July 2026

> Historical design rationale. The playable implementation is now authoritative;
> see [RULEBOOK.md](./RULEBOOK.md) for current rules and
> [ARCHITECTURE.md](./ARCHITECTURE.md) for the built system. Candidate features in
> this document are not necessarily part of v1.

> Build the map. Sell the truth. Reach the deep first.

## 1. The promise

Blackwater is a short, sharp strategy game for 1–6 friends on a couch. A laptop
puts the public ocean map on the TV; every player uses a phone as a private
controller and intelligence terminal.

The game should repeatedly create sentences like:

- “That contact was you. I can prove it.”
- “I will give you the coordinates if you leave my platform alone.”
- “You sold both of us different versions of the same scan.”
- “We have to stop Cyan now, but I still intend to beat you afterward.”
- “The trap was not for you—until you broke our pact.”

The desired emotions are wonder, suspicion, leverage, commitment, mischief, and
the satisfaction of watching a network you built remain on the map.

### Product constraints

| Constraint                   | Design consequence                                                               |
| ---------------------------- | -------------------------------------------------------------------------------- |
| 1–6 strategy-focused players | Real strategic interaction, not party-game prompts                               |
| 20–40 minutes                | Three simultaneous programmed pulses and a hard seven-round cap                  |
| Shared TV plus phones        | TV owns public truth; phones own secrets and intent                              |
| Conversation matters         | Resources, access, and actionable intelligence are tradable                      |
| Harsh play with comebacks    | Assets can be disabled or captured, but players and vessels are never eliminated |
| Building must matter         | Platforms are public, durable, productive, and victory-relevant                  |
| Limited randomness           | Randomness changes the problem; decisions resolve deterministically              |
| Low memorization advantage   | One-sentence faction powers, visible rules, modular map, no opaque card library  |

## 2. First-principles design pillars

### 2.1 The TV is a shared reality, not an admin screen

Everyone must be able to point at the TV and make a strategic argument. It shows
all uncontested public facts: geography, infrastructure, analyzed progress,
known victory progress, anonymous echoes, the round clock, and resolved public
events. It never receives secret state and merely hides it visually.

### 2.2 A secret is valuable only when it can change a decision

Private information is not lore or flavor text. A report can reveal a route,
owner, trap, cargo opportunity, or vulnerable platform. It can be sold, sealed,
published, altered, withheld, contradicted, or exposed after the match.

### 2.3 Expansion creates leverage, not additional turns

Every player receives exactly three Operations per round throughout the match. Platforms,
extra submarines, and modules create more ways to spend those Operations, but
never create a fourth one. A larger network is more capable and more exposed,
and its owner still cannot defend every edge.

### 2.4 The leader is balanced by legibility and incentives

The game does not secretly weaken the leader or hand free weapons to the player
in last place. The leader's durable assets and final preparations are visible.
Stopping them is materially useful: rivals can seize platforms, cargo, routes,
salvage, and bargaining power. Temporary coalitions emerge because they make
sense, not because the game commands one.

### 2.5 Losing a confrontation changes the story; it does not end participation

Vessels cannot be destroyed. A decisive loss forces a vessel to surface or
retreat, reveals information, and may drop cargo. Platforms require a visible,
multi-step process to change hands. A player who loses territory retains three
Operations, an uncapturable Ark, information, negotiating power, and a path back.

### 2.6 Randomness creates an uncertain world, not arbitrary winners

Site contents and the initial basin can vary. They are drawn from balanced sets,
can be investigated, and become fixed truths. If dynamic currents are added
later, they must be forecast before they matter. Movement, contracts, scans,
traps, captures, and encounters do not end with an unbounded die roll.

## 3. Non-goals

Blackwater is not:

- a real-time action or dexterity game;
- a hidden-traitor game in which one role supplies all the deception;
- a submarine war simulator;
- a score-salad engine builder;
- a full 3D ocean;
- an app that makes six people silently stare at phones;
- a campaign where permanent upgrades give veterans a material advantage;
- a game with player elimination, skip-a-turn damage, or eight pages of faction exceptions.

## 4. The world

Human expeditions have reached Neris, an ocean planet whose cloud layer makes
orbital surveying nearly useless. Six civilian research consortia enter the
same newly calm basin. They cooperate because no expedition can map, build,
sample, and interpret the basin alone. They compete because the expedition that
proves a complete model first will define the world's scientific future.

“Blackwater” is the local name for the deep water below the last useful light.
It is strange and beautiful, not horrific. The alien ecology follows unfamiliar
geometry and fluid dynamics: tessellated coral fans, ribbon filters, crystalline
rafts, luminous pollen blooms, and schools that trace temporary symbols in the
current.

## 5. Public truth and private truth

| Shared TV                                                     | A player's phone                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| Basin topology, static current lanes, Arks, and public Supply | Exact positions and routes of their submarines                |
| All platforms, modules, ownership, and disabled state         | Their cargo, private Signal, traps, and conflict commitment   |
| Each expedition's analyzed-specimen count                     | Their analyzed types, carried specimens, and received reports |
| Anonymous echoes and publicly identified vessels              | Probable identities behind contacts they have analyzed        |
| Public progress toward every victory Charter                  | Draft and locked Operations                                   |
| Public contracts, pledges, and breaches                       | Private offers and transfers                                  |
| Phase, timer, ready state, and public resolution              | Private consequences synchronized to the TV resolution        |

The same map orientation, sector names, and symbols appear on both devices. A
phone may reveal more about an object, but it never presents an alternate
topology that forces a player to mentally rotate the board.

## 6. Match anatomy

### Target envelope

- Players: 1–6
- Best initial test count: 4
- Teach: under 8 minutes; 90 seconds for the device interaction itself
- Expected finish: rounds 5–7
- Hard cap: 7 rounds
- Target duration after the first match: 25–35 minutes
- Default mode: free-for-all; multiple simultaneous winners are allowed

### Starting kit

Each expedition begins with:

- one visible, mobile, uncapturable **Ark** research vessel;
- one hidden submarine with 2 Integrity;
- 4 public Supply and 2 private Signal;
- two Silent Running charges;
- one undeployed snare charge and one undeployed decoy charge;
- exactly three Operations per round;
- a public, one-sentence faction power.

The submarine begins beside the Ark, then submerges. Its position is private
unless detected or voluntarily revealed. A second submarine can be built later,
but it supplies flexibility rather than another Operation. Hard caps keep the
map readable: two submarines, four platforms, and two device charges per player,
counting both inventory and deployed devices.

### Basin

The first four-player map should contain about 13 named sectors arranged as a
legible graph, not a fine hex grid. A 5–6 player map can expand toward 19
sectors. Sectors belong to three broad regions:

- **Shelf** — safe routes and cheap construction;
- **Rift** — strong currents, valuable survey sites, contested connections;
- **Blackwater** — the deepest central sectors and the most consequential sites.

Every sector has two to four connections. Depth, build sites, and current
directions are public. Exact survey contents begin hidden but are fixed at setup.
The digital game can later assemble balanced modular basins sized roughly to the
player count; procedural novelty must not replace fair topology.

Each Deep Site has one fixed specimen type drawn from a balanced setup. A Survey
reveals it privately and it does not reroll. At Forecast, every site receives one
harvestable specimen if empty; stock never accumulates above one. Simultaneous
Harvest attempts form a conflict for that yield.

A submarine carries at most two specimens. Harvested specimens are **Carried**:
only the owner sees their types, and they may be dropped, raided, or traded when
the two parties have assets in the same sector. Supply, Signal, and reports may
be traded remotely; physical specimens may not teleport. An Analyze Operation
requires the carrying submarine and a friendly active Laboratory in the same
sector. The specimen becomes **Analyzed**: its owner and existence are public,
its type remains private, and it can no longer be traded or stolen.

## 7. The round

Planning and conversation happen together. There is no separate negotiation
phase that forbids touching the game.

1. **Forecast — 15 seconds.** Platforms produce Supply and Signal; public
   aftermath and replenished specimen sites appear.
2. **Open Water — 120 seconds for 3–4 players; 150 for 5–6.** Everyone talks,
   proposes deals, handles reports, and programs one Operation into each of three
   pulses. A player can make a sequence such as Glide → Survey → Harvest.
3. **Final Lock — the last 30–45 seconds of Open Water, not extra time.** A clear
   countdown begins. Players may still unlock and revise until the deadline or
   until everyone confirms.
4. **Resolution — target 30–45 seconds.** The server resolves everything
   immediately, then presents three public pulses. Within each pulse: contracts
   and payments → simultaneous movement → detection/traps → scans/jamming →
   hunts/raids → building/harvesting/analysis/repair.
5. **Claim check — 10–20 seconds.** Victory Charters are checked
   simultaneously. The resulting stable map invites the next argument.

If a player disconnects, their last valid Operations remain. Empty slots become
**Hold** and never grant a Screen bonus or spend Signal. A missing phone never
deadlocks the match.

## 8. Operations and core verbs

Every player programs exactly three Operations, one into each resolution pulse.
Any owned asset may receive several sequential Operations. This creates tactical
combos without tying action count to wealth or territory.

| Order        | Effect                                                          | Public evidence                                 |
| ------------ | --------------------------------------------------------------- | ----------------------------------------------- |
| **Glide**    | Move a submarine one edge; optionally spend Silence             | A wake at the origin unless Silence is spent    |
| **Sprint**   | Move a submarine two edges                                      | Anonymous wakes along the path                  |
| **Navigate** | Move the Ark one edge                                           | Fully public Ark route                          |
| **Survey**   | Spend 1 Signal for an active sonar ping and sealed report       | Public contact at the pinger's sector           |
| **Harvest**  | Recover the fixed specimen at a deep site                       | Public contact; exact specimen remains private  |
| **Analyze**  | Process a carried specimen at an active Lab                     | Public progress count; type remains private     |
| **Develop**  | The Ark builds/repairs a platform or builds/repairs a submarine | The project and owner are public                |
| **Deploy**   | Place a snare or decoy                                          | Hidden until detected or triggered              |
| **Hunt**     | Attack a suspected submarine contact                            | Public if a target is present                   |
| **Raid**     | Disable or contest a platform                                   | Attempt and participants become public          |
| **Jam**      | Spend Signal to suppress sonar or a module temporarily          | A public disturbance, not the jammer's identity |
| **Go Dark**  | Hold position, refill Silence, fade an old contact              | No new evidence                                 |
| **Screen**   | Protect an asset or sector during that pulse                    | Revealed if it contributes to a conflict        |

The phone shows only actions valid for the selected asset and sector. The first
paper prototype should cut the list to Glide/Sprint, Survey, Harvest/Analyze,
Develop, Deploy, Hunt/Raid, Go Dark, and Screen. Jam enters only when passive
sonar proves strategically important.

### Traces make hidden movement deducible

Hidden movement cannot mean arbitrary guessing. Players reason from constrained
routes and evidence:

- each submarine begins with two finite Silent Running charges;
- Glide moves one edge and leaves an origin wake with approximate heading unless
  the player spends Silence;
- Sprint moves two edges and leaves wakes along the path;
- Harvest, Raid, Hunt, and active Survey create a contact at the current sector;
- holding still restores one Silence; Go Dark restores both and clears an old marker;
- contacts fade over two rounds rather than disappearing instantly;
- passive Sonar covers its own and connected sectors: one overlapping Sonar gives
  its owner sector and movement, while two also identify the owner;
- active Survey identifies every submarine in the current sector exactly but
  reveals the pinger; Echo Cartographers extend it to connected sectors;
- decoys obey the same visible signal grammar as real contacts;
- scans state when and where an observation was made.

The TV shows incomplete physical evidence. Phones turn some evidence into
private conclusions. Conversation moves those conclusions between players.

## 9. Economy and durable infrastructure

### Supply and Signal

- **Supply** is public and pays for platforms, submarines, repair, devices, and
  ordinary trades.
- **Signal** is private and pays for active sonar, jamming, and secret
  conflict commitment.

The Ark produces 2 Supply and 1 Signal per round. Each active Extractor adds 1
Supply, capped at +2; each active Sonar adds 1 Signal, capped at +2. Production
caps prevent exponential growth while preserving the value of infrastructure.

Initial cost hypotheses:

| Item                     | Cost                |
| ------------------------ | ------------------- |
| Platform with one module | 3 Supply            |
| Second submarine         | 4 Supply            |
| Repair                   | 1 Supply            |
| Snare or decoy           | 1 Supply + 1 Signal |
| Active Survey            | 1 Signal            |
| Conflict commitment      | 0–2 Signal          |

### Research platforms

A Develop Operation builds one platform with one public module:

- **Extractor:** produces Supply;
- **Sonar:** detects movement and produces Signal;
- **Laboratory:** analyzes specimens and supports Discovery victory.

Platforms are valuable because they produce, sense, bank, protect routes, and
form victory networks. They never generate additional Operations.

Only an Ark can create a platform, in its current sector. That makes expansion a
visible commitment: moving into position and spending 3 public Supply can be
anticipated, negotiated over, Screened, or raided. A submarine must be present
at a Laboratory to Analyze its carried specimen.

### Damage and ownership

- A successful Raid disables the platform module and marks it **Contested**; it
  does not erase the investment.
- Ownership can change only at the end of the following round, if the contender
  still has unique sector control. The owner gets a full planning-round response.
- Captured modules survive but remain offline briefly, making capture more useful
  than repeated destruction.
- The Ark can be jammed or inconvenienced but never destroyed or captured.
- A disabled submarine drops all carried specimens as salvage and retreats to
  its Ark. Later programmed Operations targeting it become Hold rather than
  retargeting automatically.
- An Ark may spend a Develop Operation and 1 Supply to return the submarine
  immediately with 1 Integrity. Without repair, it remains disabled for one full
  round and returns free at the following Forecast. Example: disabled in round 3,
  it sits out round 4 and returns at round 5 Forecast.
- The player still receives all three Operations for their Ark, platforms, or
  second submarine, so the player never misses a turn.

The exact contest and repair timing is a playtest variable. The invariant is that
investment persists and territorial reversal takes more than one surprise click.

## 10. Encounters without combat dice

Blackwater is about positioning, preparation, and leverage rather than damage
rolls. The first prototype uses one transparent comparison:

`Force = participating asset + platform defense + Screen bonus + 0–2 secretly committed Signal`

- A healthy submarine or Ark executing Hunt, Raid, or Screen contributes 1.
- An active friendly platform in the sector contributes 1 to its owner's defense.
- A Screen Operation contributes an additional 1.
- Signal commitment attaches to that specific Hunt, Raid, or Screen in that
  sector and pulse. It is programmed in advance and spent even if no opponent
  appears. A defender without a programmed Screen cannot add Signal reactively.
- Each sector and pulse creates at most one conflict group. Every expedition is a
  separate side unless a binding Joint Operation explicitly combines two sides.
- The unique highest Force controls the conflict. A tie for highest means nobody
  controls it; attacks fail and every participant is exposed.
- Only the winning side's declared objective resolves; other attacks fail and
  their participants are exposed. A winning Screen chooses one hostile
  participating submarine as its target.
- Margin is the winner's Force minus the next-highest Force. Win by 1: the target
  submarine loses 1 Integrity and retreats, or the target platform is disabled
  and Contested.
- Win by 2+: the target submarine is disabled, or the attacker may also steal 1
  Supply when marking the target platform Contested.
- If two independent players Raid the same platform, the unique conflict winner
  becomes its contender. No winner means its ownership is unchanged.

A retreating submarine returns one edge along its incoming route and becomes a
public identified contact for that pulse. If Integrity reaches 0, it is disabled
instead and returns to its Ark under the recovery rule.

A Contested platform is not eligible to transfer at the claim check of the round
in which it was disabled. At the end of the following round, it changes ownership
only if its contender has unique **sector control**: they are the only expedition
with a healthy submarine, Ark, or active platform there. Resolve conflicts first,
then eligible Contested transfers, then Charter checks. The owner therefore gets
one full planning round to respond. If the contender lacks unique control, the
Contested marker clears, ownership stays put, and the module reactivates at the
next Forecast. If it transfers, the new owner's module also activates at that
Forecast.

Simultaneous Harvests use a non-damaging version of the comparison: each
submarine contributes 1 plus 0–2 Signal committed to that Harvest. The unique
highest side takes the specimen; a tie leaves it at the site and exposes all
harvest contacts.

The phone previews every visible contribution and explains the result afterward.
If this becomes repetitive blind bidding, test a semantic Pursue/Evade/Ambush
triangle; never stack both systems at once.

### Traps

The MVP needs only two deceptive tools:

- **Snare:** Secretly occupies a sector and triggers on the first hostile
  submarine entering it. When deployed, its owner preprograms **Tag** (identify
  and track) or **Spill** (stop it and force one cargo drop). A Survey can
  discover and disarm the snare.
- **Decoy:** Produces a programmed sequence of plausible anonymous echoes. It
  cannot capture or survey anything, but low-confidence scans initially treat it
  as a vessel.

Traps punish haste and bad inference, not participation. They never destroy a
vessel or remove an entire round of agency. A snare charge is consumed when it
triggers or is disarmed. A decoy expires and is consumed after two rounds. A
player may buy a replacement only after a charge leaves their two-device total.
Deploy may fabricate and place that replacement in one Operation by paying its
listed cost; the two starting charges are free setup inventory.

Movement and traps resolve before Survey in the same pulse. A Survey can protect
later pulses or rounds by finding/disarming a snare, but it cannot retroactively
save movement that already triggered one.

## 11. Intelligence as a tradeable object

A Survey or passive Sonar produces a structured observation packet with:

- sector and observation time;
- contact count and class;
- movement direction, if observed;
- identity estimate, if supported;
- confidence level and sensor source.

Players can communicate it in four ways:

1. **Sealed forward.** The exact report travels with its game-verified chain of
   custody. A seal cannot be counterfeited or edited.
2. **Verified redaction.** The sender omits chosen fields; the game seals the
   fields that remain.
3. **Statement.** The sender constructs any structured claim. The recipient sees
   source and time but receives no proof.
4. **Broadcast.** Any of the above becomes visible on the TV.

Sealed evidence is intentionally reliable. Deception instead comes from selective
redaction, unverified Statements, spoken claims, decoys, omission, and refusing
to show the packet one claims to possess. That gives truth a stable price rather
than making every digital artifact equally worthless.

Forwarded reports retain provenance. Statements retain authorship and time but
are explicitly unverified; their content can be entirely fabricated. The game
never attempts to police ordinary spoken lies or omissions.

## 12. Deals, promises, and betrayal

Conversation comes first. Phones record or enforce the conclusion; they do not
replace talking with a negotiation form.

### Three levels of trust

- **Trade:** An atomic, binding exchange. Both players confirm; the server swaps
  Supply, Signal, or reports at the same moment. A physical specimen is eligible
  only when both parties have assets in the same sector.
- **Contract:** A mechanically expressible one-round commitment. The server
  enforces or escrows it and explains the exact consequence before confirmation.
- **Handshake:** The same structured term is recorded but breakable. Betrayal is
  allowed; an objectively detected breach creates a public receipt but no
  numerical reputation penalty.

Anything may also remain purely verbal and unrecorded.

Candidate one-round templates are immediate exchange, ceasefire, safe passage
through named sectors and devices, shared Sonar feed, Joint Operation against a
named target with a named capture beneficiary, and conditional payment for a
game-verifiable result.

The first playable version should implement only atomic trades and sealed report
transfers. The first networked alpha may add one escrowed payment and one
named-sector Handshake. A general contract language would consume enormous UI
and testing effort before the core game has earned it.

## 13. Known victory Charters

The TV displays every active victory condition from setup onward. The default
game uses three common Charters that any expedition can complete:

### Network — infrastructure

Own four connected active platforms spanning Shelf, Rift, and Blackwater,
including at least one Extractor and one Sonar.

### Discovery — exploration and trade

Analyze three distinct specimen types and maintain an active Laboratory. The
number analyzed is public; the types are private, so duplicates support bluffing.

### Dominion — hidden positional control

Control three marked Deep Sites at the same claim check. An undetected submarine
counts, but satisfying Dominion reveals every hidden asset used to establish
that control. On a three-player basin, test two nonadjacent Deep Sites instead.

For the prototype, an expedition controls a Deep Site if it is the only player
with a healthy submarine or active platform there after conflicts resolve. If
several remain, nobody controls it. The Ark alone never claims Dominion.

These are starting hypotheses, not sacred numbers. Together they make building,
exploration/trading, and hidden positional play independently threatening.

### Claim timing

- Charters check simultaneously after every resolution.
- Everyone satisfying a Charter wins. Two players can therefore win the same
  round, whether independently or because a deal deliberately enabled it.
- Public **Victory Watch** tracks all public steps and clearly marks an expedition
  that appears one action away as a **Threat** without exposing private progress.
- Hidden specimen types and submarine positions preserve uncertainty. Satisfying
  Dominion reveals the hidden assets establishing its Deep-Site control.
- If nobody wins by the end of round 7, score only as a time-limit fallback: 2
  per controlled Deep Site, 1 per active platform, and 1 per distinct analyzed
  specimen. Exact ties produce co-winners.

The seven-round fallback prevents a short game from becoming an indefinite
siege. Desired balance makes it rare.

### Why a leader can be stopped without fake rubber-banding

- Their platforms, modules, analyzed counts, Deep-Site presence, and public Charter progress
  are visible.
- Everyone retains three Operations, so a trailing player still has tactical weight.
- Platform output is capped, so income cannot compound forever.
- A broad network offers more raid targets than its owner can cover.
- Publishing sealed intel lets rivals coordinate against a threat.
- Capturing or disabling a leader's asset advances the attacker materially.
- Simultaneous claims let a supposed helper engineer their own win rather than
  merely choose somebody else's.
- **Open Commission:** when Victory Watch marks an expedition as a Threat, place
  a 1-Supply bounty beside it. The first rival that round to make it lose
  Integrity, mark one of its platforms Contested, or steal from it gains that
  Supply from the bank. Refresh the bounty each round while the Threat remains.
  This rewards the player who pays the tempo cost of intervention without
  directly weakening the leader.

## 14. Asymmetric expeditions

All faction rules are public, visible from every phone, and expressible in one
strong sentence. They should break a core assumption rather than accumulate
small numeric modifiers.

| Expedition             | Identity                  | Candidate power                                                                                |
| ---------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Echo Cartographers** | Broad sensing             | The first active Survey each round also covers every connected sector                          |
| **Quiet Current**      | Stealth mobility          | Submarines have three Silence and may spend one to suppress an active-operation contact        |
| **Roaming Atoll**      | Mobile infrastructure     | Once per round, the Ark may tow one owned platform into a connected sector                     |
| **Hadal Engineers**    | Construction              | The first platform built each round costs 2 rather than 3 Supply                               |
| **Concord Relay**      | Deals and interdependence | Gain 1 Signal after the first binding Contract each round and allow three-party trades         |
| **Second Dawn**        | Recovery and salvage      | Recover adjacent salvage without an Operation; disabled submarines return at the next Forecast |

These powers deliberately interact with trust and board state. They must first be
tested one at a time against symmetric expeditions. Faction content cannot rescue
a core loop that is not already fun.

### Low-memorization safeguards

- No faction-specific decks in the base game.
- The TV shows the active faction power beside each player when relevant.
- Contextual previews state when a faction changes an ordinary rule.
- First-time players receive two recommended expeditions rather than a blind list
  of six.
- Basin topology and site placement vary between matches, while the core verbs
  remain stable.

## 15. Optional hidden-affiliation mode

Free-for-all should be built and balanced first. A later 4- or 6-player mode,
**Shared Signal**, can add Spyfall-like affiliation without changing the known
victory rules:

- each phone privately receives one sponsor sigil;
- exactly two players share each sigil, but neither is told the other's identity;
- if a player completes a normal Charter, the matching sponsor partner also
  wins;
- sponsor claims are spoken and may be lies; the server reveals the truth only
  when the match ends.

This makes alliance discovery itself negotiable. It should not enter the MVP: it
would be impossible to tell whether early playtests succeeded because of the
strategy system or merely because secret teams are intrinsically entertaining.

## 16. Aesthetic direction: Pelagic Field Atlas

Blackwater should look like a live oceanographic chart projected in a civilian
research vessel's operations room—not a submarine combat HUD.

### Emotional palette

- Wonder at an unfamiliar natural system
- Calm confidence in understandable equipment
- Tension from incomplete information
- Mischief from interpersonal deception
- Pride in visible, persistent construction

Avoid military camouflage, weapon silhouettes, red-alert language, cyberpunk
glitches, black voids, skull forms, staring eyes, teeth, viscera, heartbeat audio,
and horror drones. Danger comes from strategic uncertainty.

### Rendering language

- Top-down 2.5D vector chart rather than a 3D ocean
- Bathymetric contours and screen-printed map textures
- Subtle paper/enamel grain
- Recognizable cream-and-teal civilian vessel silhouettes
- Safety-orange collars, yellow woven cables, white inflatables, repair patches
- Depth expressed through contour density and pattern as well as color
- Large illustrated specimen cards for moments of ecological wonder
- Unknown contacts drawn as incomplete chart data, never glitch or blur

### Core palette

| Role                     | Color     |
| ------------------------ | --------- |
| Deep-water field         | `#071F26` |
| Mid-water field          | `#0B3740` |
| Contours and grid        | `#2A6870` |
| Primary text             | `#F2F0E4` |
| Muted text               | `#9AB0AE` |
| Shared expedition accent | `#FF9D52` |
| Bioluminescence          | `#7BE0CE` |

Six player accents use cyan, amber, violet, lime, coral, and chalk. Every player
also has a unique emblem, vessel silhouette detail, and map pattern; color is
never the only identifier.

### Typography and icon grammar

Use IBM Plex Sans for interface text and IBM Plex Mono only for coordinates,
depth, and telemetry. The title treatment can split `BLACK / WATER` with a
horizontal waterline.

| Meaning            | Form                                |
| ------------------ | ----------------------------------- |
| Confirmed object   | Filled silhouette                   |
| Unverified contact | Hollow echo ring                    |
| Confidence         | Partial ring around contact         |
| Disabled object    | Interrupted outline                 |
| Planned route      | Dashed line                         |
| Completed route    | Fading wake                         |
| Binding agreement  | Closed clasp/seal                   |
| Breakable pledge   | Open handshake with dotted boundary |

## 17. Shared TV experience

The TV is both board and stage. During planning it remains calm enough for six
people to point, calculate, and accuse. During resolution it explains causality
without replacing the board with a cinematic.

```text
┌──────── Round · phase · timer ───── Victory Watch ────────┐
│ Players 1–3 │                                             │ Players 4–6
│             │          PUBLIC BASIN MAP                   │
│             │     platforms · echoes · currents           │
│             │                                             │
├────────────── Current event / plain-language result ───────┤
```

The map occupies roughly 75% of a 16:9 screen. At 1080p and normal couch distance:

- map labels target 30–34 px;
- important phase text targets 44–56 px;
- no essential body text is smaller than roughly 28 px;
- critical information stays inside a 5% overscan-safe boundary.

Player rails contain only public facts: identity, visible infrastructure,
analyzed-specimen count, Charter threat, and ready state. A short event caption appears during
resolution and then gets out of the way.

### Resolution choreography

1. Quiet routes resolve without exposing secret geometry.
2. One sonar sweep reveals only the echoes the public is entitled to see.
3. Sonar Surveys bloom as single clean rings.
4. Triggered encounters hold on their sector, show cause, then consequence.
5. Platforms assemble from contour rings and physical module shapes.
6. Victory lights the actual connected assets in sequence, then resolves into
   the expedition emblem with a basin-wide bioluminescent bloom.

Events resolve by region so the group can follow one causal cluster at a time.
When the camera moves, a small basin overview preserves orientation.

## 18. Phone controller experience

The phone is a private field instrument, not a miniature duplicate of the TV.
It has three persistent destinations:

- **Commands** — vessels, reachable sectors, action, reserve, review, lock;
- **Intel** — chronological packets, briefs, provenance, publish/share controls;
- **Deals** — compact offers, escrow, pledges, received proposals.

### Command flow

1. Select the Ark, a submarine, or a platform from a thumb-friendly carousel.
2. Reachable sectors illuminate on a private crop of the same map.
3. Tap or drag a route; invalid distance progressively resists rather than
   snapping or silently failing.
4. Choose the contextual action and any private reserve commitment.
5. Read a compact preview of cost, public trace, and deterministic risk.
6. Lock orders. Locking remains reversible until the timer or unanimous ready.

Once locked, the interface collapses to “Orders locked. Watch the basin,” plus a
small review/unlock control. During resolution the phones stay quiet unless a
player receives private information at the matching TV beat.

An optional couch-privacy veil blurs sensitive cards after a short idle period
and reveals them on touch. It is optional because permanent hold-to-read would
be tiring.

### Interaction feel

- Visual press feedback begins on touch-down (`scale` about 0.97).
- Dragged routes stay under the finger and remain interruptible.
- Sheets and route snaps use critically damped motion, normally 150–250 ms.
- Momentum is reserved for an actual flick or drag release; ordinary menus do
  not bounce.
- Sound, haptic, and visual confirmation occur at the causal moment.
- Reduced-motion mode replaces route travel and springs with short crossfades.

## 19. Audio and haptics

The public sound world combines hydrophone texture, muted vibraphone, brushed
metal, wood percussion, warm analog bass, and airy harmonics. It feels like a
scientific instrument with water around it, not a horror soundtrack.

| Event               | Shared sound                                | Private haptic         |
| ------------------- | ------------------------------------------- | ---------------------- |
| Select/place order  | Restrained paired tick                      | Light selection tap    |
| Lock orders         | Watertight hatch/pressure seal              | Firm commit tap        |
| Incoming deal       | TV stays quiet                              | Two short pulses       |
| New private contact | Public chirp only if public echo exists     | Short–long pulse       |
| Invalid action      | Soft damped knock                           | Visual equivalent      |
| Construction        | Cable tension followed by latch             | Firm completion tap    |
| Discovery           | Brief harmonic bloom if made public         | Gentle expanding pulse |
| Asset affected      | Public consequence sound if visible         | Heavy single pulse     |
| Victory             | Widening chord, water, distant surface wind | Synchronized pattern   |

Phones are silent by default. No information is conveyed by sound or vibration
alone.

## 20. Onboarding and accessibility

The first session starts with a QR code on the TV. There is no account and no app
store. Each player enters a name, chooses from two suggested expeditions, and
completes a 90-second shared **equipment calibration**:

1. move a sample buoy from a phone and watch it resolve on the TV;
2. receive a private contact that does not appear publicly;
3. send a sample packet to another player;
4. complete a sample atomic trade;
5. see the three active victory Charters highlighted on the basin.

This teaches the most unusual rule—the boundary between public and private
truth—before faction details. First-use explanations then appear at the relevant
control. Every resolution card has a plain-language **Why?** explanation.

After a match, a **Field Record** reveals hidden routes, traps, false Statements,
and pivotal deals round by round. This is both social payoff and the best advanced
tutorial: players learn from what actually fooled them instead of memorizing a
card encyclopedia.

Accessibility requirements:

- color plus emblem, texture, and silhouette for every player;
- high-contrast TV mode tolerant of poor display calibration;
- adjustable text scale and planning timer;
- minimum 44–48 px phone touch targets;
- screen-reader labels and dynamic text without clipped actions;
- reduced motion and reduced transparency;
- captions for public event narration;
- no rapid sonar flashing or abrupt full-screen brightness jumps;
- safe reconnect, server-saved drafts, and seat recovery;
- full rules and all public faction powers available at any time.

## 21. Example of a decisive round

Cyan publicly owns three connected platforms and has moved its Ark toward the
last Blackwater link. Victory Watch marks **Network: one step away**.

Cyan tells Amber that Violet's submarine is approaching Amber's only Laboratory
and sends a Statement showing an eastbound contact. Amber offers Cyan a recorded
Handshake: Amber will Screen Cyan's new platform if Cyan leaves the Laboratory
alone. Cyan accepts.

Lime sells Amber a sealed packet proving that the eastbound contact was a decoy
one pulse earlier, then sells Violet an unverified Statement claiming Cyan's
submarine carries a crystalline specimen. Violet pays because either claim gives them
a useful target.

The three pulses lock:

- Cyan Navigates the Ark, Develops the fourth platform, then Screens it.
- Amber deploys a snare near its Laboratory and Harvests instead of helping Cyan.
- Violet Sprints into Cyan's sector, commits two private Signal, and Raids.
- Lime Glides silently to its Laboratory and Analyzes a third specimen type.

The TV reveals Violet's wakes, assembles Cyan's platform, then shows Violet's
committed raid overpower the Screen and mark the module Contested. Amber's
Handshake breach appears publicly. The group is still arguing about whether
Amber saved everyone or merely lied when Lime's third analysis completes
**Discovery**.

No random roll selected the winner. Every reversal came from public incentives,
private evidence, committed position, and a lie another player chose to trust.

## 22. Principal design risks

| Risk                                    | Early warning                                           | Response                                                                         |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hidden movement becomes guessing        | Players attack random sectors or stop discussing routes | Finite Silence, persistent wakes, constrained paths, useful Sonar geometry       |
| Phones kill conversation                | Heads stay down for most of Open Water                  | Three-Operation cap, no chat, contextual actions, locked “watch the basin” state |
| Lying is cheap noise                    | Players ignore all shared reports                       | Immutable sealed evidence, explicit Statements, provenance, later exposure       |
| Infrastructure snowballs                | Richest player also takes more effective turns          | Fixed Operations, output caps, broad defense burden, durable capture rewards     |
| Infrastructure feels pointless          | Platforms are routinely erased in one beat              | Disabled/Contested control, module utility, route and victory integration        |
| Trailing player becomes kingmaker only  | They can stop others but cannot form a credible claim   | Keep vessels/actions, enable simultaneous claims, shorten recovery routes        |
| Encounters feel like blind bidding      | Players always commit maximum Signal                    | Position, Screen support, visible costs; test posture model only if needed       |
| Resolution drags                        | More than 20% of match is passive playback/admin        | Resolve instantly, group pulses by region, target 30–45 seconds                  |
| Experienced players win by memorization | Rules lookup and content recall dominate                | One-sentence powers, generated topology, small action grammar, outcome previews  |
| Discovery luck decides matches          | Needed specimen appears arbitrarily                     | Balanced setup, Survey-before-Harvest, visible site likelihood, trade routes     |
| Six-player map becomes illegible        | Echoes overlap and nobody follows resolution            | Scaled basin, region grouping, strict icon grammar, public-state pruning         |
| Faction powers obscure the core         | Testers discuss exceptions more than inference/deals    | Test symmetric game first and add one faction at a time                          |

## 23. Prototype roadmap

The project should prove fun in the cheapest medium capable of testing each
hypothesis. Visual polish cannot answer whether hidden movement is deducible.

### Stage 0 — paper alpha

Build:

- 13-node printed basin;
- four symmetric expeditions;
- one visible Ark and one hidden submarine per player;
- public Supply, private Signal, Silence markers, one snare, and one decoy;
- three programmed Operations per player and pulse-by-pulse resolution;
- moderator-issued sealed observation cards, verified-redaction covers, and
  blank Statement slips so the information economy exists on paper;
- Glide/Sprint, Survey, Harvest/Analyze, Develop, Deploy, Hunt/Raid, Go Dark,
  and Screen;
- Network and Discovery for the first two matches, then add Dominion;
- Open Commission bounties as soon as Victory Watch/Threat is used;
- a human moderator and six fixed rounds for initial balance comparison, moving
  to the seven-round cap once the loop is stable.

Run at least 3–5 four-player matches, changing only one rule family between
sessions.

Exit evidence:

- players infer routes from evidence rather than guess;
- at least one voluntary, consequential offer per player;
- at least one report changes an order;
- public construction creates a credible threat;
- a trailing player can still form or stop a claim without being reduced to a
  spectator.

### Stage 1 — deterministic resolver

Build a single-device moderator tool containing canonical state, simultaneous
order entry, deterministic resolution, redacted event generation, and replay.
Players may still use paper slips.

Purpose:

- settle timing and edge cases;
- verify public/private event sequencing;
- make rule changes cheap;
- prove the simulation without paying the networking and responsive-UI cost.

### Stage 2 — TV-and-phones vertical slice

Build only:

- `/display`, `/controller`, and `/host` web routes;
- room creation, QR join, four seat tokens, reconnect, pause/extend;
- one basin, symmetric expeditions, two win conditions;
- plan/lock, server resolution, TV beats, private result cards;
- sealed forward, verified redaction, and editable Statement;
- atomic Supply/Signal/report trades;
- one snare and one decoy.

Do not yet build six factions, procedural maps, free-text chat, complex contracts,
hidden teams, accounts, matchmaking, bots, campaigns, cosmetics, achievements,
or native apps.

### Stage 3 — couch alpha

Add 3/5/6-player map scaling, three victory Charters, one faction at a time,
simple Handshakes, Field Record, onboarding, accessibility settings, and deliberate
resolution presentation.

The build graduates when ordinary matches finish in 25–35 minutes, teach in
under 8 minutes, and consistently produce both a credible late threat and a
specific story players retell afterward.

### Stage 4 — content and finish

Only after repeat-play evidence:

- complete six expeditions;
- build balanced modular basin generation;
- expand binding contracts and pledges carefully;
- commission specimen illustrations and create final iconography;
- produce the sound/haptic system;
- add Shared Signal mode;
- refine Field Record into a fast, dramatic post-match reveal.

## 24. Playtest measurement

Record facts rather than relying on “that was fun”:

- total time and time per phase;
- Operation revisions, timeouts, and default Holds;
- rules questions by round;
- deals offered, accepted, rejected, fulfilled, and broken;
- packets shared and whether they changed a recipient's action;
- false Statements believed, ignored, and later exposed;
- traps deployed and triggered;
- platform lifespan and value produced before disable/capture;
- perceived leader after rounds 3 and 5 versus actual Charter position;
- number and timing of credible victory threats;
- whether the last-place player could still state a plausible plan;
- reconnects, stale states, and UI errors.

Private post-match questions:

1. What was the most exciting moment?
2. What was the most confusing moment?
3. Who did you fear after rounds 3 and 5, and why?
4. When behind, could you still win or materially improve your position?
5. Which report or promise did you believe, and what evidence mattered?
6. What would you try differently immediately?
7. Would you play again next week?

Useful initial gates:

- 25–35 minutes after the first teach;
- by round 2, most Operations need no rules help;
- zero eliminated or agency-free rounds;
- each player makes at least one meaningful offer;
- at least one consequential information play per match;
- at least two credible victory threats in the final two rounds;
- resolution/admin below 20% of paper play and about 30–45 seconds per digital round;
- at least three of four testers request an immediate rematch.

The most valuable qualitative signal is not a rating. It is players retelling a
specific ambush, betrayal, or false report and proposing what they will do next
time.

## 25. Technical shape

The game should be a responsive TypeScript web application. The laptop opens the
public display and puts it on the TV; phones join from a QR code in ordinary
browsers.

Recommended first architecture:

- React and Vite for shared display/controller UI;
- a small authoritative Node service using Fastify or Express;
- WebSockets, with Socket.IO as a pragmatic first reconnect/room layer;
- a finite-state match machine: lobby → calibration → planning → locked →
  resolution → claim/result;
- deterministic, seeded resolution;
- append-only event log plus a snapshot after each accepted command and phase;
- SQLite on a durable single host for initial testing.

The server owns phase time, costs, positions, hidden information, random seed,
deals, and victory. Clients send intents only. A single projection boundary must
produce a distinct state for the TV and each seat:

```ts
project(canonicalState, { kind: "display" });
project(canonicalState, { kind: "player", playerId });
```

Never send full canonical state to every client and hide secrets with CSS. The TV
payload, browser logs, and replay events must contain public information only.

Resolution should be computed instantly, then emitted as timed, viewer-specific
beats. Animation presents the rules; it never determines them.

### Reliability requirements

- opaque seat token stored locally and reissuable by the host;
- public-only display token safe to refresh;
- server-side order drafts and revisions with idempotent command IDs;
- reconnect returns the current private projection and allowed missed events;
- conservative Hold on timeout;
- host pause/extend and seat-reclaim controls;
- host/display refresh does not end the match.

A small durable hosted service minimizes QR and Wi-Fi friction for real playtests,
while the same server should remain runnable on the local network. Avoid
peer-to-peer authority, direct client database writes, and native apps for the
prototype.

## 26. Decisions versus experiments

### Commit now

- Shared TV plus private phone controllers
- Civilian alien-ocean survey theme with no horror treatment
- Public persistent infrastructure and private mobile vessels
- Three programmed Operations per player, one per pulse
- Conversation during planning
- Tradeable sealed evidence, verified redaction, and editable unverified claims
- Binding exchange, breakable Handshake, and unrecorded verbal promise
- Known sudden-win Charters and simultaneous winners
- Victory Watch plus Open Commission bounty for a legible, valuable leader target
- No elimination and no combat dice
- Top-down field-atlas visual language

### Earn through playtest

- 13/19-sector topology and exact player-count scaling
- Second-submarine cost and whether it arrives too early or late
- Four Supply, two Signal, production caps, and all costs
- Platform construction, Contested control, and repair timing
- Exact Survey radius, contact confidence, Silence recovery, and wake duration
- Force comparison versus posture prediction for encounters
- Four/three/three thresholds for the three Charters
- Round timer lengths and seven-round fallback scoring
- Each faction power

### Defer deliberately

- Shared Signal hidden teams
- Conditional contract language
- Procedural basin generation
- Dynamic currents and additional depth layers
- Online matchmaking or remote public games
- Bots, campaigns, progression, cosmetics, and achievements
- Native mobile applications

## 27. Immediate next action

The next artifact should not be a polished digital map. It should be a printable
four-player paper kit plus a moderator worksheet implementing only the Stage 0
rules. One evening of real play will invalidate more weak assumptions than a week
of interface construction.
