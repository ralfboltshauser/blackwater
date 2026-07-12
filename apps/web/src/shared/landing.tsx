import { createRoot } from "react-dom/client";
import { Brand } from "./Brand";
import "./bootstrap";
import "./landing.css";

function Landing() {
  return (
    <main className="landing">
      <div className="landing__water" aria-hidden="true">
        <div className="landing__rings" />
      </div>
      <header className="landing__header">
        <Brand className="landing__brand" />
        <span className="eyebrow">
          Pelagic survey network · local expedition console
        </span>
      </header>
      <section className="landing__hero">
        <div>
          <p className="eyebrow">1–6 players · shared TV + private phones</p>
          <h1>
            Build the map.
            <br />
            Sell the truth.
            <br />
            <em>Reach the deep first.</em>
          </h1>
          <p className="landing__lede">
            A simultaneous strategy game of hidden submarines, durable research
            stations, tradeable evidence and victories everyone can see
            coming—but nobody can safely ignore.
          </p>
          <div className="landing__actions">
            <a className="button-primary" href="/host.html">
              Host an expedition
            </a>
            <a className="button-secondary" href="/play.html">
              Join with a room code
            </a>
          </div>
        </div>
        <div className="landing__instrument panel" aria-label="Game overview">
          <div className="landing__instrument-head">
            <span className="eyebrow">Basin status</span>
            <span className="connection-pill">Local system ready</span>
          </div>
          <div className="landing__depth">
            <span>SHALLOW SHELF</span>
            <span>RIFT</span>
            <span>BLACKWATER</span>
          </div>
          <svg
            viewBox="0 0 640 420"
            role="img"
            aria-label="Stylized Blackwater basin network"
          >
            <defs>
              <radialGradient id="nodeGlow">
                <stop offset="0" stopColor="#4bd8dd" stopOpacity=".55" />
                <stop offset="1" stopColor="#4bd8dd" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="landing__currents">
              <path d="M40 112C170 44 250 182 378 96s204-37 230 17" />
              <path d="M36 286c105-83 199 31 282-36s197-73 286 18" />
            </g>
            <g className="landing__network">
              <path d="M72 88 206 64 330 108 470 70 577 119M72 88l52 118 144-40 62-58 76 115 164-22M124 206l54 126 144-58 84-51 78 126 86-148M178 332l144-58 162 75" />
            </g>
            {[
              [72, 88],
              [206, 64],
              [330, 108],
              [470, 70],
              [577, 119],
              [124, 206],
              [268, 166],
              [406, 223],
              [570, 201],
              [178, 332],
              [322, 274],
              [484, 349],
            ].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                <circle r="28" fill="url(#nodeGlow)" />
                <circle
                  r={i === 7 || i === 10 ? 9 : 6}
                  className={i === 7 || i === 10 ? "deep" : ""}
                />
              </g>
            ))}
            <g
              className="landing__ark"
              transform="translate(342 252) rotate(-17)"
            >
              <path d="m-30 0 14-11h37L34 0 20 11h-38Z" />
              <path d="M-9-11 0-23h13l7 12" />
              <path d="M-45 1h15M34 1h30" />
            </g>
          </svg>
          <div className="landing__readouts">
            <span>
              <b>3</b> programmed pulses
            </span>
            <span>
              <b>0</b> combat dice
            </span>
            <span>
              <b>7</b> rounds maximum
            </span>
          </div>
        </div>
      </section>
      <footer className="landing__footer">
        <span>Runs entirely on this local network</span>
        <span>
          Known victory charters · no elimination · simultaneous resolution
        </span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Landing />);
