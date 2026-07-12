import { BRIEFING_SLIDE_COUNT } from "@blackwater/protocol";

export type BriefingVisual =
  | "detection"
  | "landfall"
  | "charters"
  | "truth"
  | "expedition"
  | "basin"
  | "program"
  | "resolution"
  | "discover"
  | "contest"
  | "intel"
  | "deals"
  | "comeback"
  | "round";

export interface BriefingSlide {
  id: string;
  chapter: string;
  depth: "core" | "deeper";
  title: string;
  lead: string;
  visual: BriefingVisual;
  callout: string;
  speakerNotes: readonly string[];
}

export const BRIEFING_SLIDES: readonly BriefingSlide[] = [
  {
    id: "detection",
    chapter: "The signal",
    depth: "core",
    title: "A new ocean world has been detected.",
    lead: "Neris was invisible beneath permanent cloud—until one calm patch of ocean opened and answered our survey pulse. Four organizations launched before the signal was even confirmed.",
    visual: "detection",
    callout: "One world. One brief window. Four expeditions.",
    speakerNotes: [
      "Neris is not a settled world or a battlefield. It is a scientific first contact with an ocean nobody understands.",
      "The permanent storms have opened one patch of ocean for only a few hours. Four civilian research organizations reached it at the same time.",
      "Each player will command one of those expeditions. The colors identify rivals, not fixed teams.",
    ],
  },
  {
    id: "landfall",
    chapter: "Landfall",
    depth: "core",
    title: "Four expeditions reach the same calm waters.",
    lead: "This connected area is called the Neris Basin. In plain language: it is the shared ocean map on the TV. You command one expedition exploring it.",
    visual: "landfall",
    callout: "Understand Neris first: Network · Discovery · Dominion.",
    speakerNotes: [
      "Basin simply means the connected patch of ocean shown on the TV. It is the shared game map—not another resource or special rule.",
      "You are not conquering Neris. You are racing to produce the first complete, defensible understanding of these waters.",
      "Everyone needs access, resources, and information, so cooperation is useful. Only complete proof earns a Charter, so every partner remains a rival.",
      "Your infrastructure persists and your information can be traded, hidden, or falsified. The next slide defines the three exact ways to win.",
    ],
  },
  {
    id: "charters",
    chapter: "The objective",
    depth: "core",
    title: "Complete one mission shown on the TV.",
    lead: "Network, Discovery, and Dominion are the three public win conditions across the top of the game screen. Complete any one at the end of a round to win.",
    visual: "charters",
    callout: "Watch the top bar: everyone can see who is close.",
    speakerNotes: [
      "Network means exactly four connected active platforms across Shelf, Rift, and Blackwater, including an Extractor and Sonar.",
      "Discovery means all three specimen types analyzed and an active Laboratory.",
      "Dominion means uniquely controlling every marked Dominion Deep Site. After Round 7, a transparent fallback score decides instead.",
    ],
  },
  {
    id: "truth",
    chapter: "The table",
    depth: "core",
    title: "The TV is shared truth. Your phone is leverage.",
    lead: "Everyone sees the same ocean map, infrastructure, pressure, and public evidence. Only you see your hidden routes, Signal, cargo, traps, and reports.",
    visual: "truth",
    callout: "Point at the TV. Bargain from your phone.",
    speakerNotes: [
      "Never pass a phone unless you deliberately want to reveal it.",
      "A contact on the TV is evidence, not proof of identity. Conversation is how uncertain evidence becomes action.",
      "An AI-marked rival gets the same public facts and only its own private projection. It cannot inspect another expedition's hidden state.",
    ],
  },
  {
    id: "expedition",
    chapter: "Your expedition",
    depth: "core",
    title: "One Ark. Hidden submarines. Persistent infrastructure.",
    lead: "Your public Ark moves and builds. Submarines explore in secret. Platforms stay on the map and make your plan stronger—but never give extra turns.",
    visual: "expedition",
    callout: "Every player always programs exactly three Operations.",
    speakerNotes: [
      "Supply is public and pays for construction. Signal is private and powers scans, commitments, and interference. Silence hides submarine movement.",
      "The Ark cannot be destroyed or captured. You begin with one submarine, 4 Supply, 2 Signal, 2 Silence, a snare, and a decoy.",
      "At each later Forecast, the Ark produces 2 Supply and 1 Signal. Extractors and Sonars can each add up to 2 more of their resource.",
    ],
  },
  {
    id: "basin",
    chapter: "The basin",
    depth: "core",
    title: "Move along connections. Fight over meaningful sectors.",
    lead: "The graph runs from Shelf through Rift into Blackwater. Deep Sites hold specimens and may also be the locations required for Dominion.",
    visual: "basin",
    callout: "A route is a promise about where you can act next.",
    speakerNotes: [
      "Submarines and Arks move along the visible connections. Only one platform fits in a sector.",
      "A Pulse-1 move changes which later Operations are legal for that asset. The Ark builds; submarines Survey, Harvest, and fight.",
      "Ordinary Glide leaves an origin wake and heading. Silent Glide spends Silence and avoids that wake and passive Sonar; Sprint leaves evidence on both legs.",
    ],
  },
  {
    id: "program",
    chapter: "Open Water",
    depth: "core",
    title: "Secretly program three causal Pulses.",
    lead: "Choose one Operation for Pulse 1, 2, and 3 while everyone talks. Your phone checks routes and reserves costs before you lock.",
    visual: "program",
    callout: "Glide → Survey → Harvest is one coherent plan.",
    speakerNotes: [
      "You can unlock and revise until the deadline or until everyone locks.",
      "More assets create options, not more Operations. If time expires, the last valid plan resolves and missing slots Hold.",
    ],
  },
  {
    id: "resolution",
    chapter: "Resolution",
    depth: "core",
    title: "Everyone’s Pulse resolves together.",
    lead: "The server reveals Pulse 1, then 2, then 3. Outcomes are deterministic: timing, position, commitments, and other plans—not combat dice—decide what happens.",
    visual: "resolution",
    callout: "A plan can be valid now and still be disrupted later.",
    speakerNotes: [
      "Movement and traps happen before scans in a Pulse; conflict and development follow their fixed resolution order.",
      "If an earlier event makes a later order impossible, that order becomes Hold. The game never chooses a new target for you.",
    ],
  },
  {
    id: "discover",
    chapter: "Growing power",
    depth: "deeper",
    title: "Discover, carry, analyze, build.",
    lead: "Survey a Deep Site, Harvest its specimen, bring it to an active Laboratory, then Analyze it. Or invest Supply in productive platforms and a second submarine.",
    visual: "discover",
    callout: "What you build persists. What you analyze cannot be stolen.",
    speakerNotes: [
      "Extractors produce Supply. Sonars produce Signal and observations. Laboratories turn carried specimens into Discovery progress.",
      "A submarine carries two specimens. Each Analyze raises your public analyzed count, but the specimen type remains private.",
      "A platform costs 3 Supply, a second submarine 4, and a repair 1. Survey or Jam costs 1 Signal; conflict commitments use 0–2.",
    ],
  },
  {
    id: "contest",
    chapter: "Interference",
    depth: "deeper",
    title: "Commit where it matters. Bluff where it hurts.",
    lead: "Hunt submarines, Raid platforms, Jam modules, Screen a sector, or Deploy hidden snares and decoys. Highest unique Force wins; ties expose everyone and attacks fail.",
    visual: "contest",
    callout: "Signal is spent even when your suspected target is absent.",
    speakerNotes: [
      "Force starts from the programmed Hunt, Raid, or Screen and 0–2 committed Signal. Screen and an active platform can add defense where eligible.",
      "A decisive Hunt disables rather than destroys. Capturing a platform is a visible multi-round process with time to answer.",
    ],
  },
  {
    id: "intel",
    chapter: "Information",
    depth: "deeper",
    title: "Truth can be sealed, sold, redacted—or invented.",
    lead: "Verified observations can become sealed reports or verified redactions. Statements are explicitly unverified and may be completely false.",
    visual: "intel",
    callout: "The game proves provenance, not honesty.",
    speakerNotes: [
      "Forward reports privately, include them in a Trade, or Broadcast them to the TV.",
      "Active Survey pings publicly but gives private exact observations; it can also disarm a snare for later Pulses.",
      "Ordinary speech is never policed. If somebody says ‘trust me,’ deciding whether to trust them is the game.",
    ],
  },
  {
    id: "deals",
    chapter: "Negotiation",
    depth: "deeper",
    title: "Deals have different kinds of teeth.",
    lead: "Trades are atomic and binding. Handshakes are recorded but breakable, leaving a public breach receipt. Verbal promises are whatever the table makes of them.",
    visual: "deals",
    callout: "Talk first. Record only the conclusion that matters.",
    speakerNotes: [
      "Trade Supply, Signal, sealed reports, and eligible co-located specimens. Either the whole exchange happens or none of it does.",
      "Handshakes cover ceasefire or safe passage for one round. Betrayal is legal; detectable betrayal is public.",
      "AI rivals currently execute Operations but do not negotiate structured Deals, so use at least two humans when teaching Trades and Handshakes.",
    ],
  },
  {
    id: "comeback",
    chapter: "Pressure",
    depth: "deeper",
    title: "A visible leader becomes everyone’s target.",
    lead: "Victory Watch exposes public Network and Discovery threats. An Open Commission makes coordinated interference materially worth negotiating.",
    visual: "comeback",
    callout: "Harsh consequences. No elimination. Always three Operations.",
    speakerNotes: [
      "The first Pulse in which rivals damage that expedition’s submarine or contest its platform pays 1 Supply to every rival who qualified in that Pulse.",
      "A disabled submarine drops cargo and later returns, or can be repaired early. Your Ark and gathered Intel always remain.",
      "Even from behind you can rebuild, trade information, expose a route, steal tempo, or pivot to another Charter.",
    ],
  },
  {
    id: "round",
    chapter: "Ready to dive",
    depth: "core",
    title: "Forecast. Plan and talk. Resolve. Check the claim.",
    lead: "That loop repeats for at most seven rounds. Round 1 is setup: no Charter is reachable yet. From Round 2 onward, one or several expeditions can qualify together.",
    visual: "round",
    callout: "Keep your phone private. Keep your eyes on the TV. Keep talking.",
    speakerNotes: [
      "For the first game, follow the operations your phone offers and ask what each public trace will reveal.",
      "The important first-round question is simple: what are you building toward, and who can help or stop you?",
      "If Round 7 has no Charter winner, score 2 per uniquely controlled Deep Site, 1 per active platform, and 1 per distinct analyzed type; exact ties share victory.",
    ],
  },
];

if (BRIEFING_SLIDES.length !== BRIEFING_SLIDE_COUNT) {
  throw new Error(
    `Briefing deck has ${BRIEFING_SLIDES.length} slides; protocol expects ${BRIEFING_SLIDE_COUNT}`,
  );
}
