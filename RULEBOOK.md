# Blackwater rulebook

## The table

Blackwater is for 1–6 expeditions. One screen is the public basin; every human
player has one private phone. Never pass a phone around unless its owner
deliberately wants to reveal something. Pointing, bargaining, bluffing, and
making temporary alliances are part of play.

The standard game is free-for-all. More than one player may win when Charters
are checked. There is no elimination and nobody gains extra Operations by
building more assets.

## AI rivals and solo testing

The host may fill any non-human seat with a server-controlled AI rival. A legal
game has 1–6 expeditions and always keeps at least one human phone seat.
AI seats are visibly marked on the host, phone lobby, and TV.

Each AI receives the same public projection and its own private projection that
a phone would receive. It cannot inspect rival submarine positions, cargo,
Signal, devices, or plans. During Open Water it deterministically programs and
locks three legal Operations; resolution, Forecast, and Charter checks use the
ordinary rules. Network, Discovery, Dominion, Interdictor, and Adaptive policies
create different priorities without changing what the AI is allowed to know.

AI rivals currently do not make or accept structured Deals. They remain legal
targets for Hunt, Raid, Jam, Intel, Charters, and Open Commissions. Add a second
human when testing binding Trades or breakable Handshakes.

## Win a Charter

After every round, all three known Charters are checked simultaneously:

- **Network:** own exactly four active, mutually connected platforms spanning
  Shelf, Rift, and Blackwater, with at least one Extractor and one Sonar.
- **Discovery:** have analyzed all three distinct specimen types and own an
  active Laboratory. Your public analyzed count is visible; the types are not.
- **Dominion:** uniquely control every marked Dominion Deep Site. This is two
  nonadjacent sites with 1–3 players and three sites with 4–6 players. An
  active submarine or platform controls a site; an Ark does not. Required sites
  carry an amber objective mark on the shared map.

Every player satisfying any Charter wins. If nobody has done so after round 7,
the fallback is 2 points per uniquely controlled Deep Site, 1 per active
platform, and 1 per distinct analyzed specimen type. Exact ties share victory.

## Starting expedition

Each player begins with:

- one public, mobile, uncapturable Ark;
- one private submarine with 2 Integrity, cargo space for two specimens, and
  two Silence charges;
- 4 public Supply and 2 private Signal;
- one undeployed snare and one undeployed decoy;
- three Operations per round.

You may own at most four platforms, two submarines, and two live or inventoried
devices. Optional faction powers are public and are off by default.

## Public and private truth

The TV shows basin topology, Arks, platforms, public Supply, analyzed counts,
Charter pressure, public contacts, wakes, salvage, recorded Handshakes, breaches,
commissions, phase, timer, and locked status.

Your phone additionally shows exact positions and state of your submarines,
private Signal, Silence, cargo, devices, observations, sealed reports, offers,
and your three-Pulse draft. A hollow contact is evidence, not proof of identity.
Wakes reveal an origin and rough heading, never a hidden destination.

## A round

1. **Forecast.** Arks and active modules produce resources, sites restock, old
   evidence fades, and temporary disabled/jammed states advance.
2. **Open Water.** Everyone talks and programs exactly one Operation into each
   of Pulses 1, 2, and 3. Drafts are server-saved. Locking is reversible until
   the deadline or until everyone locks.
3. **Resolution.** The server deterministically resolves all plans, then the TV
   presents Pulse 1, Pulse 2, Pulse 3, and the Charter check. Private result
   cards appear on the relevant phones.
4. **Charter check.** Wins and the Open Commission are resolved. If nobody wins,
   the next Forecast begins.

If time expires, the last valid draft is used and missing Pulses become Hold. A
sleeping phone does not deadlock the table. Losing an asset never removes your
three Operations.

## Resources and building

**Supply** is public. **Signal** is private. At Forecast, every Ark produces 2
Supply and 1 Signal. Active Extractors add up to 2 more Supply total; active
Sonars add up to 2 more Signal total.

- Platform: 3 Supply
- Second submarine: 4 Supply
- Repair submarine: 1 Supply
- Active Survey or Jam: 1 Signal
- Replacement snare or decoy: 1 Supply + 1 Signal
- Harvest, Hunt, Raid, or Screen commitment: 0–2 Signal

An Ark builds at its current sector. Platforms persist and have one public
module:

- **Extractor** produces Supply;
- **Sonar** produces Signal and passive observations;
- **Laboratory** analyzes specimens.

Only one platform can occupy a sector. Platforms do not create Operations.

## The Operations

The phone teaches Operations progressively instead of presenting the entire
command library at once:

- **Round 1 core:** movement, Survey, Develop, and Hold are always visible for
  the selected asset.
- **Context opportunities:** Harvest and Analyze appear only when the selected
  submarine is in a sector where they can work.
- **Round 2 tactics:** one collapsed Tactics group brings Deploy, Go Dark, Hunt,
  and Screen online. Raid and Jam appear there only beside a rival platform.

Hold an Operation button for a quick explanation, or open **Explain** for when
to use it, what input it still needs, and what everyone will see. The phone also
previews cost and any deterministic validation issue.

- **Hold:** do nothing; an attributed stationary submarine recovers Silence.
- **Glide:** move a submarine one edge. Spend one Silence to leave no ordinary
  wake.
- **Sprint:** move a submarine two connected edges and leave evidence along the
  route.
- **Navigate:** move the Ark one edge. The route is public.
- **Survey:** spend 1 Signal from a submarine or active Sonar to create private
  observations and a public ping/contact where required.
- **Harvest:** contest a stocked Deep Site or salvage in the same sector. A
  unique highest commitment takes it; a tie leaves site stock in place.
- **Analyze:** consume a carried specimen while the carrier shares a sector with
  your active Laboratory. The count becomes public; the type remains private.
- **Develop:** use the Ark to build a platform, build a second submarine, or
  repair a submarine.
- **Deploy:** place a hidden Tag/Spill snare or a two-round decoy route. Once a
  starting device is consumed, Deploy can fabricate its replacement for the
  listed cost.
- **Hunt:** attack a suspected seat or known contact in the same sector.
- **Raid:** attack a rival platform in the same sector.
- **Jam:** suppress a platform module temporarily.
- **Go Dark:** stay put, refill Silence, and reduce old evidence.
- **Screen:** commit protection to an asset/sector and optionally counter a
  named rival.

Operations are causal. A Pulse-1 move changes where that asset can act in Pulse 2. If an earlier event disables or displaces an asset, later impossible orders
become Hold instead of choosing a new target for you.

## Encounters

There are no combat dice. A side's Force is its participating asset, active
friendly platform support, programmed Screen support, and 0–2 Signal committed
to that specific encounter. Signal is spent even if the suspected opponent is
not there.

The unique highest Force wins. A tie means attacks fail and participants are
exposed. A one-point Hunt margin damages and retreats a submarine; a margin of
two disables it. A successful Raid marks a platform Contested rather than
deleting it. Ownership can transfer only after the defender has had a full round
to respond and the contender later holds unique sector control.

A disabled submarine drops cargo as public salvage and returns to its Ark. It
can be repaired early for 1 Supply or returns automatically after its recovery
delay. The Ark cannot be destroyed or captured.

## Snares and decoys

A hidden **Tag** snare identifies and tracks the first hostile submarine entering
its sector. A **Spill** snare stops it and forces one cargo drop. Survey can find
and disarm a snare, but movement and triggers resolve before Survey in the same
Pulse.

A **decoy** follows its programmed short route and creates plausible contacts.
It cannot harvest, control, or attack. Devices are consumed when triggered,
disarmed, or expired.

## Intel

Sensor observations can become structured game objects:

- **Sealed report:** immutable game-verified fields with provenance and custody.
- **Verified redaction:** a sealed report containing only selected verified
  fields.
- **Statement:** an authored, explicitly unverified claim; its contents may be
  false.
- **Broadcast:** publish a report or Statement as shared evidence on the TV.

A sealed report can be forwarded or included in a Trade without losing its
chain of custody. Ordinary speech is never policed by the game.

## Deals

Talk first, then record only the conclusion that matters.

- **Trade:** two players propose and both confirm an immediate atomic exchange
  of Supply, Signal, sealed reports, and eligible physical specimens. The entire
  exchange succeeds or none of it does. Physical specimens require co-located
  donor and receiving submarines with cargo capacity.
- **Handshake:** two players record a one-round ceasefire or safe-passage term.
  It is intentionally breakable. A game-detectable Hunt, Raid, or device breach
  creates a public receipt; there is no automatic reputation score.
- **Verbal promise:** anything else. It has no mechanical enforcement.

Locked-plan resources are reserved, so accepting a Trade cannot silently make
an already locked plan unaffordable.

## Threats and comebacks

Victory Watch marks a publicly legible one-action Network or Discovery threat.
While a player is a threat, an Open Commission watches each Pulse. The first
Pulse in which rivals damage that expedition's submarine or contest its
platform pays 1 Supply to every distinct rival who qualified in that Pulse;
later Pulses cannot claim it. The reward compensates players who spend tempo
intervening; it does not erase the leader's investment.

Platforms, submarines, reports, and routes keep value across rounds. A trailing
player still has an Ark, every piece of Intel they gathered, and exactly three
Operations, so they can rebuild, trade, expose, interfere, or pursue a different
Charter.

## Optional factions

When enabled, each player gets one public exception:

- **Echo Cartographers:** the first active Survey each round reaches connected
  sectors.
- **Quiet Current:** submarines carry a third Silence and may suppress one
  public active-operation contact each round.
- **Roaming Atoll:** once per round, its Ark may tow a friendly platform while
  navigating.
- **Hadal Engineers:** the first platform each round costs 2 Supply.
- **Concord Relay:** gains 1 Signal after its first accepted Trade each round.
- **Second Dawn:** recovers from loss sooner and may collect one eligible salvage
  without an Operation.

Use symmetric expeditions for the first game.
