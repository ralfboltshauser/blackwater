# Balance audit — rules 1.0.0

Date: 11 July 2026

This is a deterministic systems audit, not a claim that bots can measure table
fun. The richer simulator uses six strategy profiles—Network, Discovery,
Dominion, Interdictor, Broker, and Adaptive—and exercises construction,
movement, conflict, analysis, sealed reports, report sales, physical specimen
trades, resource trades, Concord rebates, all Charters, and fallback scoring.

Each row below is 1,000 seeded matches. No submitted bot program was invalid in
any of the 8,000 matches.

## Default symmetric game

| Players | Charter finish | Round-7 fallback | Average finish | Charter occurrences                       |
| ------: | -------------: | ---------------: | -------------: | ----------------------------------------- |
|       3 |            588 |              412 |           5.23 | Dominion 496 · Network 74 · Discovery 18  |
|       4 |            655 |              345 |           4.93 | Dominion 513 · Network 103 · Discovery 39 |
|       5 |            837 |              163 |           4.54 | Network 669 · Dominion 183 · Discovery 36 |
|       6 |            699 |              301 |           5.07 | Network 612 · Discovery 92                |

Winner-seat occurrences were 398/372/314 at 3 players, 267/254/294/296 at 4,
238/225/219/227/224 at 5, and 216/162/182/184/211/184 at 6. Co-winners mean
occurrence totals can exceed 1,000.

The 4–5 player symmetric game has the cleanest seat spread. The 3-player result
retains an 8.4-point first-to-third spread and its two-site Dominion route is the
main finish. At 5–6, Network becomes the main bot finish. Discovery is reached,
but the heuristic agents are poor at planning multi-round cargo, Laboratory,
and negotiated missing-type exchanges; the raw rate must not be treated as a
human Discovery handicap without play evidence.

## Optional factions enabled

| Players | Charter finish | Round-7 fallback | Average finish | Charter occurrences                       |
| ------: | -------------: | ---------------: | -------------: | ----------------------------------------- |
|       3 |            569 |              431 |           5.44 | Dominion 432 · Network 102 · Discovery 38 |
|       4 |            706 |              294 |           4.81 | Dominion 526 · Network 147 · Discovery 38 |
|       5 |            897 |              103 |           4.12 | Network 713 · Dominion 291 · Discovery 31 |
|       6 |            809 |              191 |           4.67 | Network 621 · Dominion 182 · Discovery 91 |

At 5–6 players Hadal Engineers produced roughly 30% of winner-seat occurrences;
Concord Relay produced roughly 8%. This may partly reflect the bots' direct
construction preference and incomplete valuation of human information leverage.
It is still a concrete reason that factions are off by default.

Across the faction-enabled sample, the agents completed 25,482 atomic Trades,
4,101 report transfers, 494 physical specimen transfers, and 17,033 report seals.
The mechanics are reachable and stable under long repeated play.

## What the simulation establishes

- Canonical setup, Forecast, three-Pulse resolution, Claim Check, and the
  seven-round cap terminate deterministically at every player count.
- All three Charter implementations and fallback scoring are reachable.
- Social and physical-transfer rules survive thousands of interleavings without
  breaking invariants or producing invalid programs.
- Match length stays inside the intended round band.
- Network pressure at 5–6, Dominion pressure at 3–4, optional Hadal/Concord
  variance, and the 3-player seat spread are the first human-test targets.

## What it cannot establish

The agents do not bluff, value provenance socially, retaliate, form temporary
coalitions, coordinate attacks on a leader, exploit a spoken promise, read a
friend, or experience the two-minute action clock. Interdictors react to a
public threat with a simple heuristic. Those omissions directly affect the
systems intended to police a leading Network or Dominion position.

Changing costs or Charter thresholds from this dataset alone would therefore
be false precision. The correct next evidence is repeated human play on the
same rules build.

## First human playtest protocol

Start with at least six 4-player symmetric matches before enabling factions or
changing a constant. Record:

- teach time, round count, wall-clock time, winner, and Charter;
- every round in which Victory Watch marked a threat and whether opponents
  spent Operations responding;
- binding Trades, Handshakes, breaches, sealed packets sold, and specimen
  transfers;
- how often a locked player looked back at their phone instead of the TV/table;
- whether the losing players still believed they had a self-winning line in the
  last two rounds;
- one post-game 1–5 rating each for agency, deduction, negotiation value,
  readability, and desire for an immediate rematch.

Change one rule family at a time only when the same failure repeats. Re-run the
seeded simulator after every rules change to catch mechanical regressions, then
compare human sessions on the old and new build.

Reproduce either regime with:

```bash
pnpm test:balance -- --matches=1000 --factions=false
pnpm test:balance -- --matches=1000 --factions=true
```
