import { Brand } from "../shared/Brand";
import { BRIEFING_SLIDES, type BriefingVisual } from "./content";
import "./briefing.css";

export function BriefingStage({ slideIndex }: { slideIndex: number }) {
  const safeIndex = Math.max(
    0,
    Math.min(BRIEFING_SLIDES.length - 1, slideIndex),
  );
  const slide = BRIEFING_SLIDES[safeIndex]!;
  const cinematic = cinematicVisual(slide.visual);
  return (
    <main
      className={`briefing-stage ${cinematic ? "is-cinematic" : ""}`}
      data-visual={slide.visual}
      aria-live="polite"
      aria-label={`Crew briefing slide ${safeIndex + 1} of ${BRIEFING_SLIDES.length}`}
    >
      <div className="briefing-stage__water" aria-hidden="true" />
      {cinematic && (
        <img
          className="briefing-stage__cinematic"
          src={cinematic.src}
          alt={cinematic.alt}
        />
      )}
      <header className="briefing-stage__header">
        <Brand className="briefing-stage__brand" />
        <div className="briefing-stage__chapter">
          <span>{String(safeIndex + 1).padStart(2, "0")}</span>
          <div>
            <small>
              {slide.depth === "core" ? "Core briefing" : "Deeper water"}
            </small>
            <b>{slide.chapter}</b>
          </div>
        </div>
      </header>

      <section className="briefing-stage__body">
        <div className="briefing-stage__copy">
          <p className="eyebrow">Expedition briefing</p>
          <h1>{slide.title}</h1>
          <p>{slide.lead}</p>
        </div>
        {!cinematic && <BriefingVisualView visual={slide.visual} />}
      </section>

      <footer className="briefing-stage__footer">
        <strong>{slide.callout}</strong>
        <div
          className="briefing-stage__progress"
          aria-label={`Slide ${safeIndex + 1} of ${BRIEFING_SLIDES.length}`}
        >
          {BRIEFING_SLIDES.map((candidate, index) => (
            <span
              key={candidate.id}
              className={index === safeIndex ? "is-current" : ""}
            />
          ))}
        </div>
        <small>Host controls the briefing</small>
      </footer>
    </main>
  );
}

function cinematicVisual(visual: BriefingVisual) {
  if (visual === "detection") {
    return {
      src: "/briefing/neris-detected-v1.webp",
      alt: "Four civilian expedition ships converging on the newly detected ocean planet Neris.",
    };
  }
  if (visual === "landfall") {
    return {
      src: "/briefing/neris-landfall-v1.webp",
      alt: "Four rival research expeditions establishing themselves around the same connected area of alien ocean.",
    };
  }
  return null;
}

function BriefingVisualView({ visual }: { visual: BriefingVisual }) {
  switch (visual) {
    case "detection":
    case "landfall":
      return null;
    case "charters":
      return <ChartersVisual />;
    case "truth":
      return <TruthVisual />;
    case "ark-dossier":
      return <AssetDossierVisual kind="ark" />;
    case "resources":
      return <ResourcesVisual />;
    case "submarine-dossier":
      return <AssetDossierVisual kind="submarine" />;
    case "platform-dossier":
      return <AssetDossierVisual kind="platform" />;
    case "devices-dossier":
      return <AssetDossierVisual kind="devices" />;
    case "basin":
      return <BasinVisual />;
    case "program":
      return <ProgramVisual />;
    case "resolution":
      return <ResolutionVisual />;
    case "discover":
      return <DiscoverVisual />;
    case "contest":
      return <ContestVisual />;
    case "intel":
      return <IntelVisual />;
    case "deals":
      return <DealsVisual />;
    case "comeback":
      return <ComebackVisual />;
    case "round":
      return <RoundVisual />;
  }
}

function ResourcesVisual() {
  const resources = [
    {
      kind: "supply",
      name: "Supply",
      purpose: "Build & repair",
      source: "Ark + Extractors",
      spend: "Platforms · submarines · repairs",
    },
    {
      kind: "signal",
      name: "Signal",
      purpose: "Scan & contest",
      source: "Ark + Sonars",
      spend: "Survey · Jam · conflict",
    },
    {
      kind: "silence",
      name: "Silence",
      purpose: "Move unseen",
      source: "Stored on each submarine",
      spend: "Quiet Glide",
    },
  ] as const;
  return (
    <div className="briefing-visual briefing-resources" aria-hidden="true">
      <header>
        <span>PRIVATE STORES · SHOWN ON YOUR PHONE</span>
        <b>WHAT YOU CAN SPEND</b>
      </header>
      <div className="briefing-resources__grid">
        {resources.map((resource, index) => (
          <article key={resource.name} className={`is-${resource.kind}`}>
            <div className="briefing-resources__token">
              <i />
              <strong>{index + 1}</strong>
            </div>
            <small>{resource.purpose}</small>
            <h2>{resource.name}</h2>
            <dl>
              <dt>Gain it</dt>
              <dd>{resource.source}</dd>
              <dt>Spend it</dt>
              <dd>{resource.spend}</dd>
            </dl>
          </article>
        ))}
      </div>
      <footer>
        <span>NOT RESOURCES</span>
        <b>Integrity = health</b>
        <b>Cargo = carrying space</b>
      </footer>
    </div>
  );
}

function ChartersVisual() {
  const charters = [
    [
      "network",
      "Network",
      "4 linked platforms",
      "3 regions · Extractor + Sonar",
    ],
    ["discovery", "Discovery", "3 specimen types", "+ active Laboratory"],
    ["dominion", "Dominion", "Control every mark", "No rival present"],
  ] as const;
  return (
    <div className="briefing-visual briefing-objective" aria-hidden="true">
      <img
        className="briefing-objective__screen"
        src="/briefing/game-screen-objective-v1.webp"
        alt=""
      />
      <div className="briefing-objective__topbar">
        <span /> Three public win conditions live here
      </div>
      <div className="briefing-objective__missions">
        {charters.map(([kind, title, metric, detail]) => (
          <article key={kind} className={`is-${kind}`}>
            <span className={`charter-icon charter-icon--${kind}`} />
            <div>
              <h2>{title}</h2>
              <strong>{metric}</strong>
              <p>{detail}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="briefing-objective__check">
        The server checks all three after every round
      </div>
    </div>
  );
}

function TruthVisual() {
  return (
    <div className="briefing-visual briefing-truth" aria-hidden="true">
      <section className="briefing-truth__tv">
        <header>
          <span /> PUBLIC BASIN <b>LIVE</b>
        </header>
        <div className="briefing-truth__map">
          <i />
          <i />
          <i />
          <i />
          <i />
          <img src="/sprites/ark-dir00.webp" alt="" />
        </div>
        <footer>ARKS · PLATFORMS · CONTACTS · SUPPLY</footer>
      </section>
      <section className="briefing-truth__phone">
        <header>PRIVATE CONSOLE</header>
        <img src="/sprites/submarine-dir00.webp" alt="" />
        <strong>SUB A · SECTOR 11</strong>
        <div>
          <span>SIGNAL 2</span>
          <span>SILENCE 2</span>
        </div>
        <footer>ROUTE · CARGO · TRAPS · INTEL</footer>
      </section>
      <div className="briefing-truth__link">same map orientation</div>
    </div>
  );
}

function AssetDossierVisual({
  kind,
}: {
  kind: "ark" | "submarine" | "platform" | "devices";
}) {
  const dossiers = {
    ark: {
      code: "YOUR LARGE SHIP ON THE TV",
      visibility: "ALWAYS VISIBLE",
      sprites: ["ark-dir00.webp"],
      capabilities: [
        ["Move it", "Follow one line to a connected location"],
        ["Build there", "Place a platform where the Ark is now"],
        ["Support", "Create or repair a submarine there"],
      ],
      telemetry: ["PUBLIC ON TV", "BUILDS AT ITS LOCATION", "CANNOT BE LOST"],
    },
    submarine: {
      code: "SUB-A · FIELD ASSET",
      visibility: "PRIVATE POSITION",
      sprites: ["submarine-dir00.webp"],
      capabilities: [
        ["Explore", "Move, Survey, and Harvest"],
        ["Carry", "Transport up to two specimens"],
        ["Operate", "Deploy, Hunt, Raid, and Jam"],
      ],
      telemetry: ["INTEGRITY 2", "CARGO 0/2", "SILENCE 2"],
    },
    platform: {
      code: "PLATFORM · INFRASTRUCTURE",
      visibility: "PUBLIC · PERSISTENT",
      sprites: ["platform.webp"],
      capabilities: [
        ["Extractor", "Produces public Supply"],
        ["Sonar", "Produces Signal and can Survey"],
        ["Laboratory", "Analyzes carried specimens"],
      ],
      telemetry: ["ONE PER LOCATION", "COST 3", "NO EXTRA ACTION"],
    },
    devices: {
      code: "FIELD KIT · INFORMATION WARFARE",
      visibility: "HIDDEN UNTIL REVEALED",
      sprites: ["snare-armed.webp", "decoy-deployed.webp"],
      capabilities: [
        ["Tag snare", "Identify and track an intruder"],
        ["Spill snare", "Stop movement and drop cargo"],
        ["Decoy", "Create a believable false route"],
      ],
      telemetry: ["DEPLOY BY SUB", "TWO-DEVICE CAP", "SURVEY COUNTERS"],
    },
  } as const;
  const dossier = dossiers[kind];
  return (
    <div
      className={`briefing-visual briefing-dossier is-${kind}`}
      aria-hidden="true"
    >
      <header className="briefing-dossier__header">
        <span>{dossier.code}</span>
        <b>{dossier.visibility}</b>
      </header>
      <div className="briefing-dossier__subject">
        <div className="briefing-dossier__reticle">
          <i />
          <i />
          <i />
        </div>
        <div className="briefing-dossier__sprites">
          {dossier.sprites.map((sprite) => (
            <img key={sprite} src={`/sprites/${sprite}`} alt="" />
          ))}
        </div>
        <span>AUTHORIZED FIELD PROFILE</span>
      </div>
      <div className="briefing-dossier__capabilities">
        <small>Primary capabilities</small>
        {dossier.capabilities.map(([title, detail], index) => (
          <article key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{title}</h2>
              <p>{detail}</p>
            </div>
          </article>
        ))}
      </div>
      <footer className="briefing-dossier__telemetry">
        {dossier.telemetry.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </footer>
    </div>
  );
}

function BasinVisual() {
  return (
    <div className="briefing-visual briefing-basin" aria-hidden="true">
      <svg viewBox="0 0 760 500" role="presentation">
        <path className="region shelf" d="M15 20H745L680 170 65 155Z" />
        <path className="region rift" d="m65 155 615 15 55 165L25 325Z" />
        <path className="region blackwater" d="m25 325 710 10 10 145H15Z" />
        {[
          [120, 100, 260, 120],
          [260, 120, 350, 245],
          [520, 115, 350, 245],
          [650, 105, 520, 115],
          [350, 245, 205, 300],
          [350, 245, 520, 335],
          [205, 300, 120, 420],
          [520, 335, 620, 430],
          [205, 300, 390, 425],
          [520, 335, 390, 425],
        ].map((line, index) => (
          <line
            key={index}
            x1={line[0]}
            y1={line[1]}
            x2={line[2]}
            y2={line[3]}
          />
        ))}
        {briefingBasinNodes.map(([x, y, deep], index) => (
          <g key={index} className={deep ? "deep dominion" : ""}>
            <circle cx={x} cy={y} r="17" />
            <circle cx={x} cy={y} r="5" />
            {deep && (
              <path
                d={`M${x} ${y - 30} ${x + 30} ${y} ${x} ${y + 30} ${x - 30} ${y}Z`}
              />
            )}
          </g>
        ))}
      </svg>
      <span className="briefing-basin__region is-shelf">Shelf</span>
      <span className="briefing-basin__region is-rift">Rift</span>
      <span className="briefing-basin__region is-blackwater">Blackwater</span>
      <img
        className="briefing-basin__ark"
        src="/sprites/ark-dir00.webp"
        alt=""
      />
      <img
        className="briefing-basin__site"
        src="/sprites/deep-site-a.webp"
        alt=""
      />
      <div className="briefing-basin__legend">
        <i /> Deep Site <i /> Dominion mark
      </div>
    </div>
  );
}

const examplePulses = [
  ["01", "Glide", "Sub A", "Move one edge"],
  ["02", "Survey", "Sub A", "Read the site"],
  ["03", "Harvest", "Sub A", "Take the specimen"],
] as const;

const briefingBasinNodes: Array<[number, number, boolean]> = [
  [120, 100, false],
  [260, 120, false],
  [520, 115, false],
  [650, 105, false],
  [350, 245, true],
  [205, 300, false],
  [520, 335, true],
  [120, 420, false],
  [390, 425, true],
  [620, 430, false],
];

function ProgramVisual() {
  return (
    <div className="briefing-visual briefing-program" aria-hidden="true">
      <div className="briefing-program__track">
        {examplePulses.map(([pulse, action, asset, detail], index) => (
          <article key={pulse}>
            <span>{pulse}</span>
            <small>Pulse</small>
            <h2>{action}</h2>
            <strong>{asset}</strong>
            <p>{detail}</p>
            {index < 2 && <i>›</i>}
          </article>
        ))}
      </div>
      <div className="briefing-program__lock">
        <span /> Draft valid <b>Lock all three</b>
      </div>
    </div>
  );
}

function ResolutionVisual() {
  const lanes = [
    ["CYAN", "Glide", "Survey", "Harvest"],
    ["AMBER", "Navigate", "Develop", "Screen"],
    ["VIOLET", "Sprint", "Hunt", "Go Dark"],
  ];
  return (
    <div className="briefing-visual briefing-resolution" aria-hidden="true">
      <header>
        <span>Pulse 1</span>
        <span>Pulse 2</span>
        <span>Pulse 3</span>
      </header>
      {lanes.map((lane, laneIndex) => (
        <div
          key={lane[0]}
          className="briefing-resolution__lane"
          data-seat={
            laneIndex === 0 ? "cyan" : laneIndex === 1 ? "amber" : "violet"
          }
        >
          <b>{lane[0]}</b>
          {lane.slice(1).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ))}
      <div className="briefing-resolution__rule">
        <i /> Fixed order · deterministic outcome · private results return to
        phones
      </div>
    </div>
  );
}

function DiscoverVisual() {
  const steps = [
    ["deep-site-a.webp", "Survey", "Learn what lives here"],
    ["sample-pod.webp", "Harvest", "Carry one specimen"],
    ["laboratory.webp", "Analyze", "Lock in Discovery"],
  ] as const;
  return (
    <div className="briefing-visual briefing-discover" aria-hidden="true">
      <div className="briefing-discover__chain">
        {steps.map(([sprite, title, detail], index) => (
          <article key={title}>
            <span>{index + 1}</span>
            <img src={`/sprites/${sprite}`} alt="" />
            <h2>{title}</h2>
            <p>{detail}</p>
            {index < 2 && <i>›</i>}
          </article>
        ))}
      </div>
      <div className="briefing-discover__modules">
        <span>
          <img src="/sprites/extractor.webp" alt="" />
          Extractor <b>Supply</b>
        </span>
        <span>
          <img src="/sprites/sonar.webp" alt="" />
          Sonar <b>Signal</b>
        </span>
        <span>
          <img src="/sprites/laboratory.webp" alt="" />
          Laboratory <b>Analyze</b>
        </span>
      </div>
    </div>
  );
}

function ContestVisual() {
  return (
    <div className="briefing-visual briefing-contest" aria-hidden="true">
      <div className="briefing-contest__arena">
        <span className="briefing-contest__sector">Sector 09</span>
        <div className="briefing-contest__asset is-cyan">
          <img src="/sprites/submarine-dir00.webp" alt="" />
          <b>Hunt</b>
        </div>
        <div className="briefing-contest__asset is-amber">
          <img src="/sprites/ark-dir00.webp" alt="" />
          <b>Screen</b>
        </div>
        <div className="briefing-contest__force">
          <small>FORCE</small>
          <b>3</b>
          <i>vs</i>
          <b>3</b>
          <strong>TIE · EXPOSED</strong>
        </div>
      </div>
      <div className="briefing-contest__tools">
        {[
          ["Hunt", "sub"],
          ["Raid", "platform"],
          ["Jam", "module"],
          ["Screen", "protect"],
          ["Deploy", "trap"],
        ].map(([name, detail]) => (
          <span key={name}>
            <b>{name}</b>
            {detail}
          </span>
        ))}
      </div>
    </div>
  );
}

function IntelVisual() {
  return (
    <div className="briefing-visual briefing-intel" aria-hidden="true">
      <article className="briefing-report is-sealed">
        <span>VERIFIED · SEALED</span>
        <h2>Contact report</h2>
        <dl>
          <dt>Sector</dt>
          <dd>11</dd>
          <dt>Class</dt>
          <dd>Submarine</dd>
          <dt>Heading</dt>
          <dd>Northwest</dd>
        </dl>
        <footer>Verified origin and holders</footer>
      </article>
      <article className="briefing-report is-redacted">
        <span>VERIFIED · REDACTED</span>
        <h2>Contact report</h2>
        <i />
        <i />
        <strong>Sector 11</strong>
        <footer>Selected fields only</footer>
      </article>
      <article className="briefing-report is-statement">
        <span>UNVERIFIED STATEMENT</span>
        <h2>“Cyan is in the Rift.”</h2>
        <strong>May be false</strong>
        <footer>Authored by Amber</footer>
      </article>
    </div>
  );
}

function DealsVisual() {
  const deals = [
    ["Trade", "Atomic", "Both confirm. Everything moves—or nothing does."],
    ["Handshake", "Breakable", "The rule can be broken. The breach is public."],
    [
      "Verbal promise",
      "Untracked",
      "The game records nothing. Remember it yourself.",
    ],
  ];
  return (
    <div className="briefing-visual briefing-deals" aria-hidden="true">
      {deals.map(([title, badge, detail], index) => (
        <article
          key={title}
          className={
            index === 0
              ? "is-binding"
              : index === 1
                ? "is-breakable"
                : "is-verbal"
          }
        >
          <span>{badge}</span>
          <h2>{title}</h2>
          <p>{detail}</p>
          <div>
            <i />
            <b>⇄</b>
            <i />
          </div>
        </article>
      ))}
    </div>
  );
}

function ComebackVisual() {
  return (
    <div className="briefing-visual briefing-comeback" aria-hidden="true">
      <section className="briefing-comeback__leader">
        <span>VICTORY WATCH</span>
        <img src="/sprites/ark-dir00.webp" alt="" />
        <h2>Cyan is one action away</h2>
        <div>
          <i />
          <i />
          <i />
          <i />
        </div>
      </section>
      <section className="briefing-comeback__commission">
        <small>OPEN COMMISSION</small>
        <strong>+1 Supply</strong>
        <p>Every qualifier in the first successful interference Pulse</p>
      </section>
      <section className="briefing-comeback__return">
        <img src="/sprites/submarine-dir00.webp" alt="" />
        <div>
          <small>Disabled, not destroyed</small>
          <b>Repair early or return later</b>
        </div>
        <strong>3 OPS</strong>
      </section>
    </div>
  );
}

function RoundVisual() {
  const steps = [
    ["01", "Forecast", "Produce · restock · recover"],
    ["02", "Plan + talk", "Program three Pulses"],
    ["03", "Resolve", "Pulse 1 · 2 · 3"],
    ["04", "Charter check", "Win now—or dive again"],
  ];
  return (
    <div className="briefing-visual briefing-round" aria-hidden="true">
      <div className="briefing-round__loop">
        {steps.map(([number, title, detail]) => (
          <article key={number}>
            <span>{number}</span>
            <h2>{title}</h2>
            <p>{detail}</p>
          </article>
        ))}
        <i className="briefing-round__arrow one">›</i>
        <i className="briefing-round__arrow two">›</i>
        <i className="briefing-round__arrow three">›</i>
      </div>
      <div className="briefing-round__ready">
        <span /> Expedition briefing complete <b>Dive when the crew is ready</b>
      </div>
    </div>
  );
}
