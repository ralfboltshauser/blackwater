import { OPERATION_META, type OperationKind } from "./operations";

export const GUIDE_CATEGORIES = [
  "Start here",
  "Assets & map",
  "Orders",
  "Strategy",
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number];
export type GuideArticleId = string;

export type GuideSection = {
  title: string;
  body?: string[];
  steps?: string[];
  note?: string;
};

export type GuideArticle = {
  id: GuideArticleId;
  category: GuideCategory;
  title: string;
  summary: string;
  glyph: string;
  keywords: string[];
  sections: GuideSection[];
  related?: GuideArticleId[];
};

export function operationGuideId(kind: OperationKind): GuideArticleId {
  return `order-${kind}`;
}

const foundation: GuideArticle[] = [
  {
    id: "start",
    category: "Start here",
    title: "What you are trying to do",
    summary:
      "Lead one expedition on Neris and complete a public Charter before the seventh-round fallback.",
    glyph: "◎",
    keywords: ["goal", "win", "neris", "beginner", "overview"],
    sections: [
      {
        title: "The short version",
        body: [
          "The TV is the shared ocean map. Your phone is your private command console. Each round, everyone secretly programs three Operations, talks, trades, and then watches those Operations resolve together.",
          "You win by completing Network, Discovery, or Dominion at a Charter Check. Several expeditions can qualify and win at the same time.",
        ],
      },
      {
        title: "Your first round",
        steps: [
          "Choose one Ark or submarine.",
          "Choose an order and any required target.",
          "Save Pulse 1, then repeat for Pulses 2 and 3.",
          "Lock & ready only after all three Pulses are submitted.",
          "Talk while planning—the timer belongs to everyone.",
        ],
      },
      {
        title: "A useful first question",
        body: [
          "Decide which Charter your first platform or specimen route supports. Infrastructure persists, so an early build is a commitment—not a disposable point token.",
        ],
        note: "Round 1 teaches movement and building. Tactical orders come online in Round 2.",
      },
    ],
    related: ["rounds", "public-private", "charters"],
  },
  {
    id: "public-private",
    category: "Start here",
    title: "TV truth and phone secrets",
    summary:
      "Know which facts everybody owns and which facts are leverage only you can see.",
    glyph: "◐",
    keywords: ["public", "private", "hidden", "screen", "information"],
    sections: [
      {
        title: "Always public on the TV",
        body: [
          "Ark and platform positions, platform modules and states, Deep Sites, salvage, wakes, identified contacts, Charter progress, and recorded public disturbances are shared truth.",
        ],
      },
      {
        title: "Private on your phone",
        body: [
          "Exact submarine positions, Silence, Signal, cargo types, hidden devices, sealed reports, private observations, deals, and unfinished orders stay with your expedition.",
        ],
      },
      {
        title: "Evidence is not certainty",
        body: [
          "A contact or wake proves that an event occurred, not every conclusion people draw from it. Statements can be false; sealed reports have reliable provenance. Conversation turns uncertainty into alliances, traps, and attacks.",
        ],
      },
    ],
    related: ["evidence", "intel", "deals"],
  },
  {
    id: "rounds",
    category: "Start here",
    title: "Rounds, Pulses, and timing",
    summary:
      "Forecast produces resources, Open Water creates plans, three Pulses resolve, then Charters are checked.",
    glyph: "Ⅲ",
    keywords: ["round", "pulse", "timing", "forecast", "resolution", "ready"],
    sections: [
      {
        title: "The four parts of a round",
        steps: [
          "Forecast: active infrastructure produces; sites and temporary states update.",
          "Open Water: everyone talks and secretly submits exactly three Pulses.",
          "Resolution: all Pulse-1 orders resolve, then Pulse 2, then Pulse 3.",
          "Charter Check: every expedition that currently qualifies wins simultaneously.",
        ],
      },
      {
        title: "Plans are causal",
        body: [
          "A move in Pulse 1 changes where the same asset can act in Pulse 2. Glide → Survey → Harvest is a route, not three unrelated turns. If an earlier event makes a later order impossible, that later order becomes Hold; the game never invents a replacement target.",
        ],
      },
      {
        title: "Saving and locking",
        body: [
          "Save each Pulse separately. You can revisit and resave it. Lock & ready becomes available only when all three are submitted and the open editor has no unsaved change. Until the deadline, a locked plan can still be unlocked and revised.",
        ],
      },
    ],
    related: ["start", "order-hold", "charters"],
  },
  {
    id: "resources",
    category: "Start here",
    title: "Supply, Signal, and Silence",
    summary:
      "Supply builds, Signal scans and contests, and each submarine spends its own Silence to move quietly.",
    glyph: "◇",
    keywords: ["supply", "signal", "silence", "cost", "income", "reserved"],
    sections: [
      {
        title: "Supply",
        body: [
          "Supply pays for persistent projects: platforms cost 3, a second submarine costs 4, and repair costs 1. Your Ark normally produces 2 Supply at Forecast; active Extractors add more, up to the Extractor income cap.",
        ],
      },
      {
        title: "Signal",
        body: [
          "Signal powers Survey and Jam and can be committed to Harvest or conflict. Your Ark normally produces 1 Signal at Forecast; active Sonars add more, up to the Sonar income cap.",
        ],
      },
      {
        title: "Silence",
        body: [
          "Silence belongs to one submarine, not the expedition pool. Spend 1 for a Silent Glide that avoids the ordinary wake and passive Sonar. Hold recovers 1; Go Dark refills that submarine completely.",
        ],
        note: "Saving a plan reserves its Supply and Signal across all three Pulses. The footer shows current → available after reservations.",
      },
    ],
    related: ["asset-ark", "platform-extractor", "platform-sonar"],
  },
  {
    id: "charters",
    category: "Start here",
    title: "The three ways to win",
    summary:
      "Network builds a connected system, Discovery analyzes life, and Dominion uniquely controls marked Deep Sites.",
    glyph: "△",
    keywords: [
      "win",
      "network",
      "discovery",
      "dominion",
      "charter",
      "fallback",
    ],
    sections: [
      {
        title: "Network",
        body: [
          "Have four connected active platforms spanning Shelf, Rift, and deep water, including at least one Extractor and one Sonar. Contested, jammed, or disabled platforms are not active and can break the chain.",
        ],
      },
      {
        title: "Discovery",
        body: [
          "Analyze all three distinct specimen types and retain at least one active Laboratory. Analyzed types cannot be stolen, but rivals can suppress the Lab needed for the final check.",
        ],
      },
      {
        title: "Dominion and fallback",
        body: [
          "Uniquely control every marked Dominion Deep Site at the Charter Check. A rival presence contests control. If Round 7 ends with no Charter winner, score 2 per uniquely controlled Deep Site, 1 per active platform, and 1 per distinct analyzed type; exact ties share victory.",
        ],
      },
    ],
    related: ["platforms", "fieldwork", "leader-pressure"],
  },
];

const assets: GuideArticle[] = [
  {
    id: "map",
    category: "Assets & map",
    title: "Ocean map and sectors",
    summary:
      "Assets move along visible connections; regions and Deep Sites matter to Charters and fieldwork.",
    glyph: "⌁",
    keywords: ["map", "sector", "shelf", "rift", "deep", "site", "movement"],
    sections: [
      {
        title: "Sectors and routes",
        body: [
          "Every circle is a sector and every line is a legal connection. Glide and Navigate cross one connection; Sprint reaches a fixed two-edge destination. Tap a sector on your phone for its public file.",
        ],
      },
      {
        title: "Regions",
        body: [
          "Shelf, Rift, and deep water are depth regions used by Network. They do not change basic movement cost. Deep Sites can hold specimens and some are marked for Dominion.",
        ],
      },
      {
        title: "Hidden occupancy",
        body: [
          "An empty public sector can still contain submarines, snares, or decoys. Only public entities and evidence appear on the TV; use Survey, passive Sonar, reports, and conversation to narrow the unknown.",
        ],
      },
    ],
    related: ["asset-submarine", "evidence", "charters"],
  },
  {
    id: "asset-ark",
    category: "Assets & map",
    title: "Ark",
    summary:
      "Your indestructible public construction ship produces baseline income and builds wherever it currently sits.",
    glyph: "▰",
    keywords: ["ark", "ship", "build", "navigate", "construction"],
    sections: [
      {
        title: "What it does",
        body: [
          "Every expedition has one Ark. Everyone sees it. At Forecast it normally produces 2 Supply and 1 Signal. Navigate moves it one edge; Develop builds a platform, second submarine, or repair in its current sector.",
        ],
      },
      {
        title: "What it cannot do",
        body: [
          "The Ark cannot hide, carry specimens, deploy devices, or be destroyed or captured. It is a mobile construction yard, not a combat unit.",
        ],
      },
      {
        title: "Planning pattern",
        steps: [
          "Navigate toward the sector you want to invest in.",
          "Make sure the Ark is there before the Develop Pulse.",
          "Reserve enough Supply and check that no platform already occupies the sector.",
        ],
      },
    ],
    related: ["order-navigate", "order-develop", "platforms"],
  },
  {
    id: "asset-submarine",
    category: "Assets & map",
    title: "Submarine",
    summary:
      "Your hidden field unit moves, gathers specimens, carries devices, and interferes with rivals.",
    glyph: "◒",
    keywords: [
      "submarine",
      "integrity",
      "cargo",
      "silence",
      "disabled",
      "retreat",
    ],
    sections: [
      {
        title: "Private state",
        body: [
          "Exact position, cargo, Silence, and most intentions remain private. A submarine has two Integrity and two cargo spaces. Its public evidence can reveal a route without revealing every private detail.",
        ],
      },
      {
        title: "Damage and recovery",
        body: [
          "Losing a conflict by 1 usually costs 1 Integrity and forces a retreat. Losing by 2 or more disables the submarine: it drops cargo and returns to its Ark or recovery flow. Players are never eliminated, and repair can restore a damaged unit.",
        ],
      },
      {
        title: "A second submarine",
        body: [
          "Develop can build a second submarine for 4 Supply. Construction is public and the new unit becomes usable at the next Forecast. More units create more routing options, but you still submit only three total Operations.",
        ],
      },
    ],
    related: ["resources", "fieldwork", "conflict"],
  },
  {
    id: "platforms",
    category: "Assets & map",
    title: "Platforms",
    summary:
      "Public, persistent buildings turn one sector into economy, intelligence, or specimen processing.",
    glyph: "⬡",
    keywords: ["platform", "build", "active", "contested", "jammed", "module"],
    sections: [
      {
        title: "Shared rules",
        body: [
          "A platform costs 3 Supply and is built by an Ark using Develop. Only one platform fits in a sector. It becomes public and persists until the game ends; it can be active, contested, jammed, or otherwise disabled.",
        ],
      },
      {
        title: "Active matters",
        body: [
          "Only active platforms produce, provide their module effect, and count for Charters. Raid can make one contested; Jam temporarily suppresses its module. Position and connections are therefore as important as ownership.",
        ],
      },
      {
        title: "Choose a module",
        steps: [
          "Extractor: recurring Supply and a Network requirement.",
          "Sonar: recurring Signal, nearby private detection, and a Network requirement.",
          "Laboratory: turns carried specimens into Discovery progress.",
        ],
      },
    ],
    related: ["platform-extractor", "platform-sonar", "platform-laboratory"],
  },
  {
    id: "platform-extractor",
    category: "Assets & map",
    title: "Extractor platform",
    summary: "A durable Supply engine and required piece of a Network Charter.",
    glyph: "▥",
    keywords: ["extractor", "supply", "income", "network"],
    sections: [
      {
        title: "Effect",
        body: [
          "At every Forecast, each active Extractor adds +1 Supply. Extractor income is capped at +2, on top of the Ark's normal +2 Supply.",
        ],
      },
      {
        title: "Why it matters",
        body: [
          "Network requires an Extractor among its four connected active platforms. Even outside Network, recurring Supply funds expansion, a second submarine, and repairs.",
        ],
      },
      {
        title: "Counterplay",
        body: [
          "Its owner, module, and sector are public. Raid can contest it; Jam can suppress production. Breaking one connection may also break an entire Network chain.",
        ],
      },
    ],
    related: ["platforms", "resources", "order-raid"],
  },
  {
    id: "platform-sonar",
    category: "Assets & map",
    title: "Sonar platform",
    summary:
      "A Signal engine and private listening post for movement in or beside its sector.",
    glyph: "◉",
    keywords: ["sonar", "signal", "detect", "contact", "network"],
    sections: [
      {
        title: "Effect",
        body: [
          "At Forecast, each active Sonar adds +1 Signal, capped at +2 Sonar income beyond the Ark's normal +1. It can also privately detect ordinary submarine movement entering its own or an adjacent sector.",
        ],
      },
      {
        title: "Limits",
        body: [
          "Passive contacts belong only to the owner and do not automatically identify every submarine. A Silent Glide avoids the ordinary wake and passive Sonar. Sprint remains noisy.",
        ],
      },
      {
        title: "Counterplay",
        body: [
          "The platform is public even though its observations are private. Raid can contest it and Jam can suppress its module and Forecast production.",
        ],
      },
    ],
    related: ["platforms", "evidence", "order-glide"],
  },
  {
    id: "platform-laboratory",
    category: "Assets & map",
    title: "Laboratory platform",
    summary:
      "The public processing station that converts carried specimens into permanent Discovery progress.",
    glyph: "⌬",
    keywords: ["laboratory", "lab", "analyze", "specimen", "discovery"],
    sections: [
      {
        title: "Effect",
        body: [
          "A submarine carrying a specimen must share the Lab's sector, then spend a Pulse on Analyze. The cargo is consumed; its type stays private while your analyzed count becomes public.",
        ],
      },
      {
        title: "Discovery requirement",
        body: [
          "Discovery requires all three distinct specimen types analyzed and an active Laboratory at the Charter Check. A Lab produces no Supply or Signal by itself.",
        ],
      },
      {
        title: "Counterplay",
        body: [
          "Rivals know where cargo must travel because the Lab is public. They can Hunt the courier, Raid the Lab into a contest, or Jam it before Analyze or the Charter Check.",
        ],
      },
    ],
    related: ["fieldwork", "order-analyze", "charters"],
  },
  {
    id: "devices",
    category: "Assets & map",
    title: "Snares and decoys",
    summary:
      "Hidden devices punish routes or manufacture believable evidence without being real submarines.",
    glyph: "⌄",
    keywords: ["device", "snare", "tag", "spill", "decoy", "trap"],
    sections: [
      {
        title: "Snares",
        body: [
          "Deploy a hidden snare in the submarine's current sector. Tag identifies and tracks the first hostile submarine that enters. Spill stops it and forces one cargo drop. Movement triggers a snare before Survey in the same Pulse.",
        ],
      },
      {
        title: "Decoys",
        body: [
          "A decoy follows its programmed route for two rounds and creates plausible contact evidence. It can waste Surveys, Hunts, attention, and trust, but it is not a submarine and cannot carry or control anything.",
        ],
      },
      {
        title: "Finding them",
        body: [
          "Survey can detect and disarm a snare for later Pulses. Devices remain hidden until detected, triggered, or otherwise revealed by their effect.",
        ],
      },
    ],
    related: ["order-deploy", "order-survey", "evidence"],
  },
];

type OperationDetail = {
  requirement: string;
  resolution: string;
  example: string;
  counter: string;
};

const operationDetails: Record<OperationKind, OperationDetail> = {
  hold: {
    requirement:
      "Any available unit can Hold. No target or pooled resource is required.",
    resolution:
      "The unit stays where it is. A submarine recovers 1 Silence, up to its maximum.",
    example:
      "Hold a submarine in Pulse 1 to regain Silence before a quiet Glide in Pulse 2.",
    counter:
      "Hold creates no new public evidence, but it also gives up tempo for that Pulse.",
  },
  glide: {
    requirement:
      "Choose a submarine and one connected destination. Silent Running additionally requires 1 Silence.",
    resolution:
      "Move one edge. Ordinary Glide leaves an origin wake; Silent Glide spends 1 Silence and avoids that wake and passive Sonar.",
    example:
      "Glide beside a stocked Deep Site in Pulse 1, then Survey or Harvest there later.",
    counter:
      "A snare on the entered sector triggers before later Survey. Sprinting rivals can also outrun a careful route.",
  },
  sprint: {
    requirement:
      "Choose a submarine and a legal two-edge destination shown by the editor.",
    resolution:
      "Move across both legs of the fixed route. Public wakes expose the route; Sprint cannot be made silent.",
    example:
      "Sprint home with cargo when speed matters more than hiding the courier's direction.",
    counter:
      "The route gives rivals strong evidence for a later Hunt or interception.",
  },
  navigate: {
    requirement: "Choose your Ark and one connected sector.",
    resolution:
      "Move the public Ark one edge. Its full destination is always visible.",
    example:
      "Navigate in Pulse 1 and Develop a platform in that new sector in Pulse 2.",
    counter:
      "Rivals can see the build location coming and may occupy or build there first.",
  },
  survey: {
    requirement:
      "Choose an eligible unit in the sector you want to scan and reserve 1 Signal.",
    resolution:
      "Ping the current sector, gain private exact observations, create public scan evidence, and detect/disarm eligible snares for later Pulses.",
    example:
      "Survey a stocked Deep Site in Pulse 1, then use the new information to Harvest or Hunt later.",
    counter:
      "The public ping tells everyone where scanning occurred. A snare triggered by movement earlier in the same Pulse is already too late to disarm.",
  },
  harvest: {
    requirement:
      "A submarine must share a sector with an available specimen or salvage and have cargo space. Signal commitment is optional.",
    resolution:
      "Competing Harvests compare commitment. The winner takes the selected cargo; activity at the site becomes public.",
    example:
      "Commit 1 Signal when you expect a rival to Harvest the same specimen in the same Pulse.",
    counter:
      "Rivals can outcommit you, Hunt the loaded courier, or race to the same cargo first.",
  },
  analyze: {
    requirement:
      "A submarine must carry a specimen and share a sector with your active Laboratory.",
    resolution:
      "Consume one carried specimen. Its type becomes permanently analyzed in private; only your analyzed count becomes public.",
    example:
      "Return the courier to your Lab in Pulse 1 and Analyze in Pulse 2 before a rival can suppress it.",
    counter:
      "Raid or Jam the Lab, or Hunt the courier before Analyze. Completed analysis itself cannot be stolen.",
  },
  develop: {
    requirement:
      "Use your Ark in the build sector. Reserve 3 Supply for a platform, 4 for a second submarine, or 1 for repair.",
    resolution:
      "Build one public persistent project. A platform needs an empty sector; a new submarine becomes usable at the next Forecast; repair requires the damaged submarine beside the Ark.",
    example:
      "Navigate into Rift, then Develop a Sonar that connects Shelf infrastructure toward deep water.",
    counter:
      "Rivals see the Ark and project. They can occupy a critical sector, collide with another build, or later Raid and Jam the platform.",
  },
  deploy: {
    requirement:
      "Round 2+. Use a submarine and an available Snare or Decoy in its current sector.",
    resolution:
      "Place the device secretly. Choose Tag or Spill for a snare, or program the decoy's false route.",
    example:
      "Place a Spill snare on the shortest route to your Laboratory, then dare a cargo hunter to enter.",
    counter:
      "Survey can find and disarm snares. Strange contact behavior can expose a decoy through deduction.",
  },
  hunt: {
    requirement:
      "Round 2+. Suspect a rival submarine in your submarine's current sector; choose the target and optionally commit 0–2 Signal.",
    resolution:
      "If the target is present, compare Force and resolve damage/retreat. A wrong guess spends commitment but creates no public fight.",
    example:
      "Base Force 1 plus 2 Signal beats an unscreened Force 1 target by 2, disabling it and dropping cargo.",
    counter:
      "Screen adds hidden defense and may counterattack. Decoys and false statements can make you Hunt empty water.",
  },
  raid: {
    requirement:
      "Round 2+. Your submarine must share a sector with a visible rival platform; choose it and optionally commit 0–2 Signal.",
    resolution:
      "Compare Force. A successful Raid contests the platform, making it inactive instead of deleting it.",
    example:
      "Contest the middle platform of a four-platform chain immediately before the Charter Check to break Network.",
    counter:
      "A Screen can defend the platform and committed Signal can reverse the contest. The attacker risks public exposure.",
  },
  jam: {
    requirement:
      "Round 2+. Share a sector with a rival platform and reserve 1 Signal.",
    resolution:
      "Temporarily suppress that module and create a public disturbance while the source stays hidden.",
    example:
      "Jam a Laboratory before the owner analyzes or before a Discovery Charter Check.",
    counter:
      "Jam is temporary and does not delete infrastructure. Evidence can reveal where the hidden source must have been.",
  },
  go_dark: {
    requirement: "Round 2+. Choose a submarine; no target is needed.",
    resolution:
      "Stay in place, refill all Silence, and reduce old evidence associated with that route.",
    example:
      "Go Dark after two noisy movements, then use Silent Glide next round to break the trail.",
    counter:
      "You surrender movement and action tempo, and rivals may still infer your location from objectives.",
  },
  screen: {
    requirement:
      "Round 2+. Choose a submarine protecting its current sector and optionally commit 0–2 Signal.",
    resolution:
      "Remain hidden unless the defense contributes against Hunt or Raid. If it matters, its Force joins the defense and can counterattack.",
    example:
      "Screen beside your nearly complete Network hub when rivals are likely to Raid it.",
    counter:
      "A rival can attack elsewhere, outcommit the screen, or Jam a platform without using the same contest.",
  },
};

const operationGlyphs: Record<OperationKind, string> = {
  hold: "Ⅱ",
  glide: "→",
  sprint: "≫",
  navigate: "⌁",
  survey: "◉",
  harvest: "◇",
  analyze: "⌬",
  develop: "+",
  deploy: "⌄",
  hunt: "◎",
  raid: "◫",
  jam: "≋",
  go_dark: "◌",
  screen: "◖",
};

const operationOrder = Object.keys(OPERATION_META) as OperationKind[];
const operations: GuideArticle[] = operationOrder.map((kind) => {
  const meta = OPERATION_META[kind];
  const detail = operationDetails[kind];
  return {
    id: operationGuideId(kind),
    category: "Orders",
    title: meta.label,
    summary: meta.short,
    glyph: operationGlyphs[kind],
    keywords: [kind, meta.label, meta.chapter, meta.short],
    sections: [
      { title: "When it appears", body: [meta.when, detail.requirement] },
      { title: "How it resolves", body: [detail.resolution] },
      { title: "Worked example", body: [detail.example] },
      {
        title: "Public trace and counterplay",
        body: [`Public trace: ${meta.trace}.`, detail.counter],
      },
    ],
    related:
      kind === "develop"
        ? ["platforms", "asset-ark", "resources"]
        : kind === "analyze" || kind === "harvest"
          ? ["fieldwork", "platform-laboratory", "charters"]
          : kind === "hunt" || kind === "raid" || kind === "screen"
            ? ["conflict", "leader-pressure", "evidence"]
            : ["rounds", "resources"],
  };
});

const strategy: GuideArticle[] = [
  {
    id: "fieldwork",
    category: "Strategy",
    title: "Specimens and Discovery",
    summary:
      "Survey a site, Harvest cargo, carry it to a Laboratory, and Analyze three distinct types.",
    glyph: "◈",
    keywords: [
      "specimen",
      "survey",
      "harvest",
      "cargo",
      "analyze",
      "discovery",
    ],
    sections: [
      {
        title: "The complete route",
        steps: [
          "Reach or scan a Deep Site with an available specimen.",
          "Harvest it into a submarine cargo space; rival Harvests may contest it.",
          "Carry it to the sector containing your active Laboratory.",
          "Analyze it. The type becomes permanent private progress.",
          "Repeat until all three distinct types are analyzed.",
        ],
      },
      {
        title: "What rivals see",
        body: [
          "Site activity and your analyzed count are public. Cargo identity and analyzed types stay private. The public Lab location makes the likely delivery route strategically legible.",
        ],
      },
      {
        title: "Ways to interfere",
        body: [
          "Compete for the specimen, Hunt the courier, force a cargo drop with a Spill snare, or Raid/Jam the Laboratory. Already analyzed types remain safe.",
        ],
      },
    ],
    related: ["order-survey", "order-harvest", "order-analyze"],
  },
  {
    id: "conflict",
    category: "Strategy",
    title: "Hunt, Raid, and defense",
    summary:
      "Conflict happens only when an attack finds a legal target; Force and commitments replace combat dice.",
    glyph: "⚡",
    keywords: ["fight", "combat", "force", "hunt", "raid", "screen", "damage"],
    sections: [
      {
        title: "When a fight happens",
        body: [
          "Sharing a sector does nothing by itself. Hunt must name a suspected submarine in the same sector. Raid must choose a visible rival platform in the same sector. If Hunt guessed empty water, no public fight occurs and committed Signal is still spent.",
        ],
      },
      {
        title: "Compare Force",
        body: [
          "Start with the order's base Force, add committed Signal and any contributing Screen. The single highest Force wins. A tie causes no hit and publicly exposes participants. Hunt damages/retreats submarines; Raid contests a platform instead of destroying it.",
        ],
      },
      {
        title: "Concrete example",
        body: [
          "Cyan Hunts in S09 with base Force 1 + 2 Signal = 3. Violet is really there and Screens with total Force 2. Cyan wins by 1, so Violet loses 1 Integrity and retreats. A margin of 2 would disable Violet, drop its cargo, and send it to recovery.",
        ],
      },
    ],
    related: ["order-hunt", "order-raid", "order-screen"],
  },
  {
    id: "evidence",
    category: "Strategy",
    title: "Evidence and detection",
    summary:
      "Read wakes, contacts, pings, and disturbances as bounded facts—not complete stories.",
    glyph: "∿",
    keywords: ["evidence", "wake", "contact", "survey", "sonar", "detect"],
    sections: [
      {
        title: "Common public traces",
        body: [
          "Ordinary Glide leaves an origin wake and heading. Sprint leaves evidence along both route legs. Survey creates a public ping. Harvest exposes activity at a site. Raid and conflict expose attempts/participants; Jam creates a disturbance but can hide its source.",
        ],
      },
      {
        title: "Private observations",
        body: [
          "Survey and Sonar can give exact or narrowed observations only to their owner. Those facts become social leverage: keep them private, forward a sealed report, broadcast them, trade them, redact them, or simply describe them in conversation.",
        ],
      },
      {
        title: "Avoiding overconfidence",
        body: [
          "A contact may be unidentified and a decoy can create plausible false evidence. Conversely, no public marker does not prove absence. Ask what each trace actually guarantees before spending Signal on a Hunt.",
        ],
      },
    ],
    related: ["public-private", "intel", "devices"],
  },
  {
    id: "intel",
    category: "Strategy",
    title: "Reports and statements",
    summary:
      "Reports preserve verified provenance; ordinary statements are allowed to be completely false.",
    glyph: "▤",
    keywords: ["intel", "report", "statement", "broadcast", "redact", "truth"],
    sections: [
      {
        title: "Sealed reports",
        body: [
          "A report records a real observation with provenance. You can keep it, forward it privately, include it in a binding Trade, redact permitted fields, or broadcast it to the TV.",
        ],
      },
      {
        title: "Statements",
        body: [
          "A statement is unverified player-authored information and may be true, selective, mistaken, or invented. The game proves which objects are sealed reports; it does not police table talk.",
        ],
      },
      {
        title: "Strategic use",
        body: [
          "Information can buy passage, coordinate a leader intervention, bait a rival into empty water, or expose a betrayal. Decide whether you are selling the fact, the proof, or merely confidence.",
        ],
      },
    ],
    related: ["evidence", "deals", "public-private"],
  },
  {
    id: "deals",
    category: "Strategy",
    title: "Trades, handshakes, and talk",
    summary:
      "Binding Trades exchange atomically; Handshakes are breakable promises whose detectable betrayal becomes public.",
    glyph: "⇄",
    keywords: ["deal", "trade", "handshake", "promise", "betrayal", "binding"],
    sections: [
      {
        title: "Binding Trade",
        body: [
          "Both players specify bundles of eligible Supply, Signal, reports, or co-located specimens. After acceptance, the whole exchange happens atomically or nothing moves. The server enforces the result.",
        ],
      },
      {
        title: "Breakable Handshake",
        body: [
          "A Handshake records a promise such as safe passage or ceasefire but attaches no payment and does not prevent betrayal. When the game can detect a breach, that breach becomes public.",
        ],
      },
      {
        title: "Ordinary conversation",
        body: [
          "Verbal promises require no UI and rely entirely on trust. Talk first; record only the conclusion that needs rules support. AI rivals currently do not negotiate structured Deals.",
        ],
      },
    ],
    related: ["intel", "public-private", "leader-pressure"],
  },
  {
    id: "leader-pressure",
    category: "Strategy",
    title: "Leader Threats and Commissions",
    summary:
      "A near-winner keeps their progress, but public infrastructure lets rivals delay the final step and earn a reward.",
    glyph: "▲",
    keywords: [
      "leader",
      "pressure",
      "commission",
      "comeback",
      "target",
      "threat",
    ],
    sections: [
      {
        title: "There is no Pressure resource",
        body: [
          "The TV labels a near-winner as a Leader Threat. That label is public information, not a meter you spend. A Commission may reward the first effective intervention against that expedition.",
        ],
      },
      {
        title: "How to delay each Charter",
        steps: [
          "Network: Raid a key platform into contest or Jam it to break the active chain.",
          "Discovery: Raid/Jam the Laboratory or Hunt the courier carrying the final specimen.",
          "Dominion: occupy or contest one required Deep Site so control is no longer unique.",
        ],
      },
      {
        title: "Commission reward and comeback",
        body: [
          "In the first Pulse where rivals damage the target's submarine or contest the target's platform, every rival who achieved a qualifying result in that Pulse gains the shown Supply reward; then the Commission closes. The leader loses no prior analysis, buildings, or turns. Damaged units retreat, disabled units recover, and contested platforms can be restored.",
        ],
      },
    ],
    related: ["charters", "conflict", "order-raid"],
  },
];

export const GUIDE_ARTICLES: GuideArticle[] = [
  ...foundation,
  ...assets,
  ...operations,
  ...strategy,
];

export const GUIDE_ARTICLES_BY_ID = new Map(
  GUIDE_ARTICLES.map((article) => [article.id, article]),
);

export function guideArticle(id: GuideArticleId): GuideArticle {
  return GUIDE_ARTICLES_BY_ID.get(id) ?? GUIDE_ARTICLES_BY_ID.get("start")!;
}
