import { BRIEFING_SLIDE_COUNT } from "@blackwater/protocol";

export type BriefingVisual =
  | "detection"
  | "landfall"
  | "charters"
  | "truth"
  | "ark-dossier"
  | "resources"
  | "submarine-dossier"
  | "platform-dossier"
  | "devices-dossier"
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
    id: "ark-dossier",
    chapter: "Asset dossier · Ark",
    depth: "core",
    title: "The Ark is your large construction ship on the TV.",
    lead: "Move it to the location where you want to build next. From there, it can build a platform, create your second submarine, or repair a damaged submarine.",
    visual: "ark-dossier",
    callout: "Move the Ark first. Build at its current location later.",
    speakerNotes: [
      "Point to the large ship icon on the TV. Every expedition has exactly one Ark, and everyone can always see where every Ark is.",
      "Think of it as a mobile construction yard. First use Navigate to move it one line on the map. In a later Pulse, use Develop to build at the location it currently occupies.",
      "Develop can build a platform, create your second submarine, or repair a damaged submarine. The Ark cannot be destroyed or captured.",
      "At every Forecast after setup, it also produces 2 Supply and 1 Signal. Moving or building still uses one of your three Operations.",
    ],
  },
  {
    id: "resources",
    chapter: "Expedition stores",
    depth: "core",
    title: "Your expedition manages three resources.",
    lead: "Supply builds lasting assets. Signal powers scans and conflict. Silence lets a submarine move without leaving its ordinary wake. Your current amounts stay private on your phone.",
    visual: "resources",
    callout: "Supply builds · Signal acts · Silence hides.",
    speakerNotes: [
      "Supply is construction material. Spend it to build platforms and submarines or to repair a disabled submarine. Your Ark and Extractors produce more.",
      "Signal is operational energy and attention. Spend it to Survey, Jam, and strengthen conflict commitments. Your Ark and Sonars produce more.",
      "Silence is stored stealth aboard each submarine. Spend one for a quiet Glide that avoids the ordinary wake and passive Sonar; Go Dark restores it.",
      "Integrity is a submarine's health and cargo is what it carries. They are limits, not currencies you spend on actions.",
    ],
  },
  {
    id: "submarine-dossier",
    chapter: "Asset dossier · Submarine",
    depth: "core",
    title: "Your submarine does the secret fieldwork.",
    lead: "Its exact location stays on your phone. It surveys, carries specimens, deploys devices, and interferes with rivals—while managing cargo, Integrity, and Silence.",
    visual: "submarine-dossier",
    callout: "Hidden position · two cargo spaces · two Integrity.",
    speakerNotes: [
      "A submarine can Glide, Sprint, Survey, Harvest, Analyze, Deploy, Hunt, Raid, Jam, Go Dark, Screen, or Hold when the situation permits.",
      "Ordinary movement leaves evidence. Spending Silence on Glide hides the ordinary wake; Sprint is faster but leaves evidence along both legs.",
      "A disabled submarine drops its cargo and returns to its Ark. You can later repair it; no player is eliminated.",
    ],
  },
  {
    id: "platform-dossier",
    chapter: "Asset dossier · Platform",
    depth: "core",
    title: "Build a platform when you want to invest in one location.",
    lead: "Move your Ark to a useful location, save 3 Supply, then build one permanent structure there. Choose what your plan needs next: more Supply, more information, or a place to analyze specimens.",
    visual: "platform-dossier",
    callout:
      "Extractor = build more · Sonar = know more · Laboratory = complete Discovery.",
    speakerNotes: [
      "A platform is simply a permanent building. Everyone sees it on the TV. It stays in its location and keeps helping you in later rounds.",
      "Choose an Extractor if you want a stronger economy: it produces Supply, which lets you build more. Choose a Sonar if you need Signal and information about nearby movement.",
      "Choose a Laboratory if you are pursuing Discovery: bring specimens there with a submarine and Analyze them. A Laboratory is not useful without that specimen plan.",
      "The practical sequence is: move the Ark, gather 3 Supply, then spend a later Operation to build. Only one platform fits in each location, so rivals can deny an important spot by reaching it first.",
      "Building is an investment, not an automatic first move. Extractor supports expansion, Sonar supports information and conflict, and Laboratory converts exploration into a win condition.",
    ],
  },
  {
    id: "devices-dossier",
    chapter: "Asset dossier · Devices",
    depth: "core",
    title: "Devices shape what rivals know and where they dare to move.",
    lead: "A submarine secretly deploys a snare in its current location, or sends a decoy along a short route to create convincing false contacts.",
    visual: "devices-dossier",
    callout: "Tag tracks · Spill stops · Decoy lies.",
    speakerNotes: [
      "A Tag snare identifies and tracks the first hostile submarine entering. A Spill snare stops it and forces one cargo drop.",
      "A decoy follows its programmed route for two rounds and creates plausible contact evidence without being a real submarine.",
      "You begin with one snare and one decoy. Survey can find and disarm a snare, but movement triggers it before Survey in the same Pulse.",
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
