import type { BlackwaterStore } from "./persistence";
import { MatchActor } from "./actor";
import { randomId, roomCode } from "./sessions";
import { newWorkflow, type PersistedRules, type WorkflowState } from "./state";

export interface MatchManagerOptions {
  buildId: string;
  assetManifestHash: string;
  databaseBytes: () => number;
  now?: () => number;
  onActorError?: (input: {
    actor: MatchActor;
    error: unknown;
    operation: "tick" | "runtime-gap" | "technical-pause";
  }) => void;
}

export class MatchManager {
  readonly #store: BlackwaterStore<PersistedRules, WorkflowState>;
  readonly #options: MatchManagerOptions;
  readonly #actorsById = new Map<string, MatchActor>();
  readonly #actorsByRoom = new Map<string, MatchActor>();
  #publisher: (actor: MatchActor) => void = () => undefined;
  #ticker: NodeJS.Timeout | null = null;
  #lastTickAtMs = Date.now();

  public constructor(
    store: BlackwaterStore<PersistedRules, WorkflowState>,
    options: MatchManagerOptions,
  ) {
    this.#store = store;
    this.#options = options;
  }

  public async initialize(): Promise<void> {
    for (const match of this.#store.listMatches(["lobby", "active"])) {
      const actor = this.#makeActor(match);
      if (match.lifecycle === "active") await actor.recoverAfterRestart();
    }
    this.#lastTickAtMs = this.#options.now?.() ?? Date.now();
    this.#ticker = setInterval(() => {
      const now = this.#options.now?.() ?? Date.now();
      const runtimeGap = now - this.#lastTickAtMs > 5_000;
      this.#lastTickAtMs = now;
      for (const actor of this.#actorsById.values()) {
        const operation = runtimeGap ? "runtime-gap" : "tick";
        void (runtimeGap ? actor.pauseForRuntimeGap() : actor.tick(now)).catch(
          (error: unknown) => {
            this.#options.onActorError?.({ actor, error, operation });
            void actor
              .pauseForTechnicalFailure(now)
              .catch((pauseError: unknown) => {
                this.#options.onActorError?.({
                  actor,
                  error: pauseError,
                  operation: "technical-pause",
                });
              });
          },
        );
      }
    }, 250);
    this.#ticker.unref();
  }

  public setPublisher(publisher: (actor: MatchActor) => void): void {
    this.#publisher = publisher;
  }

  public create(input: {
    playerCount: number;
    botCount?: number;
    planningSeconds: number;
    factionsEnabled: boolean;
  }): MatchActor {
    const now = this.#options.now?.() ?? Date.now();
    let code = roomCode();
    for (
      let attempts = 0;
      attempts < 20 && this.#store.getMatchByRoomCode(code);
      attempts += 1
    ) {
      code = roomCode();
    }
    if (this.#store.getMatchByRoomCode(code))
      throw new Error("Could not allocate a room code");
    const matchId = randomId("match");
    const match = this.#store.createMatch({
      matchId,
      roomCode: code,
      rulesVersion: "1.0.0",
      rulesState: { kind: "unstarted" },
      workflow: newWorkflow({
        playerCount: input.playerCount,
        botCount: input.botCount ?? 0,
        planningSeconds: input.planningSeconds,
        factionsEnabled: input.factionsEnabled,
        phaseId: randomId("phase"),
        nowMs: now,
      }),
      createdAtMs: now,
    });
    return this.#makeActor(match);
  }

  public byRoom(roomCodeInput: string): MatchActor | null {
    return this.#actorsByRoom.get(roomCodeInput.toUpperCase()) ?? null;
  }

  public byId(matchId: string): MatchActor | null {
    return this.#actorsById.get(matchId) ?? null;
  }

  public all(): MatchActor[] {
    return [...this.#actorsById.values()];
  }

  public async close(): Promise<void> {
    if (this.#ticker) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  #makeActor(
    match: ReturnType<
      BlackwaterStore<PersistedRules, WorkflowState>["getMatch"]
    > & {},
  ): MatchActor {
    if (!match) throw new Error("Match is missing");
    const actor = new MatchActor(this.#store, match, {
      buildId: this.#options.buildId,
      assetManifestHash: this.#options.assetManifestHash,
      databaseBytes: this.#options.databaseBytes,
      onChange: (changed) => this.#publisher(changed),
      ...(this.#options.now ? { now: this.#options.now } : {}),
    });
    this.#actorsById.set(actor.matchId, actor);
    this.#actorsByRoom.set(actor.roomCode, actor);
    return actor;
  }
}
