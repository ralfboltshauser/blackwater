import {
  broadcastReport,
  createMatch as createCoreMatch,
  createStatement,
  defaultProgram,
  forwardReport,
  freezeRoundInput,
  recordHandshake,
  resolveRoundInput,
  rulesStateHash,
  runClaimCheck,
  runForecast,
  sealObservation,
  settleAtomicTrade,
  validateProgram,
  type CanonicalEvent,
  type Operation,
  type RulesState,
  type SocialTransition,
  type ThreePulseProgram,
  type TradeTransfer,
} from "@blackwater/game-core";
import {
  BRIEFING_SLIDE_COUNT,
  CommandResultSchema,
  DraftPlanSchema,
  type BriefingControlRequest,
  type BriefingState,
  type CommandEnvelope,
  type CommandResult,
  type LobbySnapshot,
  type PlayerProjection,
  type PublicProjection,
  type HostProjection,
  type AuthorizedPresentationBeat,
} from "@blackwater/protocol";

import { planBotTurn } from "./bots";
import type {
  BlackwaterStore,
  MatchRecord,
  SessionRecord,
} from "./persistence";
import {
  hostProjection,
  lobbySnapshot,
  playerProjection,
  publicProjection,
  type PresenceView,
} from "./projections";
import { randomId } from "./sessions";
import {
  PersistedRulesSchema,
  WorkflowStateSchema,
  configureWorkflowBots,
  emptyPlan,
  type PendingOffer,
  type PersistedRules,
  type WorkflowState,
} from "./state";

export interface ActorConfig {
  buildId: string;
  assetManifestHash: string;
  databaseBytes: () => number;
  onChange: (actor: MatchActor) => void;
  now?: () => number;
}

interface ConnectionState {
  connectionId: string;
  role: "display" | "host" | "player";
  sessionId: string;
  seatId: string | null;
  transport: "polling" | "websocket";
  connectedAtMs: number;
}

const BEAT_DURATION_MS = 3_500;
const RESOLUTION_BEAT_COUNT = 4;

export class MatchActor {
  readonly #store: BlackwaterStore<PersistedRules, WorkflowState>;
  readonly #config: ActorConfig;
  readonly #connections = new Map<string, ConnectionState>();
  #match: MatchRecord<PersistedRules, WorkflowState>;
  #tail: Promise<void> = Promise.resolve();
  #queueDepth = 0;

  public constructor(
    store: BlackwaterStore<PersistedRules, WorkflowState>,
    match: MatchRecord<PersistedRules, WorkflowState>,
    config: ActorConfig,
  ) {
    this.#store = store;
    this.#match = match;
    this.#config = config;
  }

  public get matchId(): string {
    return this.#match.matchId;
  }

  public get roomCode(): string {
    return this.#match.roomCode;
  }

  public get queueDepth(): number {
    return this.#queueDepth;
  }

  public get match(): MatchRecord<PersistedRules, WorkflowState> {
    return this.#match;
  }

  public lobby(): LobbySnapshot {
    return lobbySnapshot(this.#match, this.#presence());
  }

  public publicView(): PublicProjection | null {
    const state = this.#visibleState();
    if (!state) return null;
    return publicProjection({
      match: this.#match,
      state,
      presence: this.#presence(),
      caption: this.#currentCaption(),
    });
  }

  public playerView(seatId: string): PlayerProjection | null {
    const state = this.#visibleState();
    if (!state) return null;
    return playerProjection({
      match: this.#match,
      state,
      seatId,
      presence: this.#presence(),
      caption: this.#currentCaption(),
    });
  }

  public hostView(): HostProjection {
    return hostProjection({
      match: this.#match,
      presence: this.#presence(),
      buildId: this.#config.buildId,
      databaseBytes: this.#config.databaseBytes(),
      actorQueueDepth: this.#queueDepth,
      schemaVersion: this.#store.schemaVersion,
      assetManifestHash: this.#config.assetManifestHash,
    });
  }

  public briefingView(): BriefingState {
    return { ...this.#match.workflow.briefing };
  }

  public controlBriefing(
    session: SessionRecord,
    request: BriefingControlRequest,
  ): Promise<BriefingState> {
    return this.run(() => {
      this.#assertHostSession(session);
      if (request.expectedRevision !== this.#match.workflow.briefing.revision)
        throw new Error("Stale briefing revision");
      if (
        request.action === "open" &&
        this.#match.lifecycle === "active" &&
        !this.#match.workflow.phase.paused
      ) {
        // A rules explanation must never consume live planning time. Closing
        // the deck intentionally leaves the match paused so resuming is an
        // explicit host decision.
        this.#pauseRaw("host-choice");
      }

      const workflow = structuredClone(this.#match.workflow);
      const current = workflow.briefing;
      let active = current.active;
      let slideIndex = current.slideIndex;

      if (request.action === "open") {
        active = true;
        slideIndex = 0;
      } else if (request.action === "close") {
        active = false;
      } else {
        if (!current.active) throw new Error("Briefing is not active");
        if (request.action === "previous")
          slideIndex = Math.max(0, current.slideIndex - 1);
        else if (request.action === "next")
          slideIndex = Math.min(
            BRIEFING_SLIDE_COUNT - 1,
            current.slideIndex + 1,
          );
        else {
          if (
            request.slideIndex === undefined ||
            !Number.isInteger(request.slideIndex) ||
            request.slideIndex < 0 ||
            request.slideIndex >= BRIEFING_SLIDE_COUNT
          )
            throw new Error("Briefing slide is out of range");
          slideIndex = request.slideIndex;
        }
      }

      if (active === current.active && slideIndex === current.slideIndex)
        return { ...current };
      workflow.briefing = {
        active,
        slideIndex,
        revision: current.revision + 1,
      };
      this.#commitWorkflow(workflow);
      this.#publish();
      return { ...workflow.briefing };
    });
  }

  public presentationBeat(
    seatId: string | null = null,
  ): AuthorizedPresentationBeat | null {
    const presentation = this.#match.workflow.presentation;
    if (!presentation.resolutionId || !presentation.currentBeatId) return null;
    const events = eventsForPresentationBeat(this.#match.workflow);
    const pulse = presentationPulse(presentation.cursor);
    const timing = {
      resolutionId: presentation.resolutionId,
      beatId: presentation.currentBeatId,
      timelineSeq: presentation.timelineSeq,
      pulse,
      startsAtServerMs: Math.max(
        0,
        (presentation.currentBeatEndsAtServerMs ?? this.#now()) -
          BEAT_DURATION_MS,
      ),
      durationMs: BEAT_DURATION_MS,
    };
    if (seatId === null) {
      const publicEvents = events.filter(
        (event) => event.visibility === "public",
      );
      const sectorEvent = publicEvents.find(
        (event) => typeof event.data.sectorId === "number",
      );
      return {
        ...timing,
        stream: "public",
        event: {
          kind: "caption",
          tone: publicEvents.some(
            (event) =>
              event.kind.includes("failed") || event.kind.includes("missed"),
          )
            ? "warning"
            : "neutral",
          text: this.#currentCaption() ?? "Resolution update",
          sectorId:
            typeof sectorEvent?.data.sectorId === "number"
              ? sectorEvent.data.sectorId
              : null,
        },
      };
    }
    const privateEvents = events.filter(
      (event) =>
        event.visibility === "private" &&
        event.audienceSeatIds.includes(seatId),
    );
    const first = privateEvents[0];
    if (first) {
      const labels = [...new Set(privateEvents.map((event) => event.kind))]
        .slice(0, 3)
        .map(humanizeEventKind)
        .join(", ");
      return {
        ...timing,
        stream: "private",
        seatId,
        event: {
          kind: "operation.result",
          operationKind: operationKindFromEvent(first.kind),
          status: privateEvents.some(
            (event) =>
              event.kind.includes("failed") || event.kind.includes("missed"),
          )
            ? "failed"
            : "succeeded",
          reason: `${privateEvents.length} private field update${privateEvents.length === 1 ? "" : "s"}: ${labels}`,
          assetId:
            typeof first.data.assetId === "string" ? first.data.assetId : null,
        },
      };
    }
    return null;
  }

  public run<T>(operation: () => T | Promise<T>): Promise<T> {
    this.#queueDepth += 1;
    const execute = this.#tail.then(operation, operation);
    this.#tail = execute.then(
      () => undefined,
      () => undefined,
    );
    return execute.finally(() => {
      this.#queueDepth -= 1;
    });
  }

  public connect(input: Omit<ConnectionState, "connectedAtMs">): Promise<void> {
    return this.run(() => {
      this.#connections.set(input.connectionId, {
        ...input,
        connectedAtMs: this.#now(),
      });
      this.#publish();
    });
  }

  public disconnect(connectionId: string): Promise<void> {
    return this.run(() => {
      const disconnected = this.#connections.get(connectionId);
      this.#connections.delete(connectionId);
      if (
        disconnected?.role === "display" &&
        !this.#presence().displayReady &&
        this.#match.lifecycle === "active" &&
        !this.#match.workflow.phase.paused
      ) {
        this.#pauseRaw("display-lost");
      }
      this.#publish();
    });
  }

  public recoverAfterRestart(): Promise<void> {
    return this.run(() => {
      if (this.#match.lifecycle !== "active") return;
      const workflow = structuredClone(this.#match.workflow);
      let changed = false;
      if (!workflow.phase.paused) {
        const now = this.#now();
        const checkpoint = Math.min(now, this.#match.heartbeatAtMs);
        const runningDeadline =
          workflow.phase.kind === "resolution"
            ? workflow.presentation.currentBeatEndsAtServerMs
            : workflow.phase.endsAtServerMs;
        workflow.phase.remainingMs =
          runningDeadline === null
            ? workflow.phase.remainingMs
            : Math.max(0, runningDeadline - checkpoint);
        workflow.phase.endsAtServerMs = null;
        workflow.phase.paused = true;
        workflow.phase.pauseReason = "restart";
        workflow.phase.epoch += 1;
        workflow.presentation.paused = true;
        workflow.presentation.currentBeatEndsAtServerMs = null;
        changed = true;
      }
      if (this.#match.rulesState.kind === "active")
        changed =
          this.#prepareBotDrafts(workflow, this.#match.rulesState.state) ||
          changed;
      if (changed) this.#commitWorkflow(workflow);
      this.#publish();
    });
  }

  public pauseForRuntimeGap(): Promise<void> {
    return this.run(() => {
      if (
        this.#match.lifecycle !== "active" ||
        this.#match.workflow.phase.paused
      )
        return;
      this.#pauseRaw("runtime-gap", this.#match.heartbeatAtMs);
      this.#publish();
    });
  }

  public pauseForTechnicalFailure(referenceMs = this.#now()): Promise<void> {
    return this.run(() => {
      if (
        this.#match.lifecycle !== "active" ||
        this.#match.workflow.phase.paused
      )
        return;
      this.#pauseRaw("technical", referenceMs);
      this.#publish();
    });
  }

  public join(displayName: string): Promise<string> {
    return this.run(() => {
      if (this.#match.lifecycle !== "lobby")
        throw new Error("Room has already started");
      const workflow = structuredClone(this.#match.workflow);
      const seat = workflow.seats.find(
        (candidate) => candidate.displayName === null,
      );
      if (!seat) throw new Error("Room is full");
      seat.displayName = displayName;
      seat.ready = false;
      seat.joinedAtMs = this.#now();
      workflow.drafts[seat.seatId] = {
        revision: 0,
        locked: false,
        plan: emptyPlan(),
        valid: true,
        invalidReasons: [],
        reservedSupply: 0,
        reservedSignal: 0,
      };
      workflow.resultCards[seat.seatId] = [];
      this.#store.upsertSeat({
        matchId: this.matchId,
        seatId: seat.seatId,
        displayName,
        joinedAtMs: seat.joinedAtMs,
      });
      this.#commitWorkflow(workflow);
      this.#publish();
      return seat.seatId;
    });
  }

  public setReady(session: SessionRecord, ready: boolean): Promise<void> {
    return this.run(() => {
      this.#assertPlayerSession(session);
      const workflow = structuredClone(this.#match.workflow);
      const seat = workflow.seats.find(
        (candidate) => candidate.seatId === session.seatId,
      );
      if (!seat) throw new Error("Seat is missing");
      if (this.#match.lifecycle !== "lobby") throw new Error("Lobby is closed");
      seat.ready = ready;
      this.#commitWorkflow(workflow);
      this.#publish();
    });
  }

  public configureBots(
    session: SessionRecord,
    targetBotCount: number,
  ): Promise<LobbySnapshot> {
    return this.run(() => {
      this.#assertHostSession(session);
      if (this.#match.lifecycle !== "lobby") throw new Error("Lobby is closed");
      if (Object.keys(this.#match.workflow.bots).length === targetBotCount)
        return this.lobby();
      const workflow = structuredClone(this.#match.workflow);
      configureWorkflowBots(workflow, targetBotCount, this.#now());
      this.#commitWorkflow(workflow);
      this.#publish();
      return this.lobby();
    });
  }

  public start(session: SessionRecord): Promise<void> {
    return this.run(() => {
      this.#assertHostSession(session);
      if (this.#match.workflow.briefing.active)
        throw new Error("End the crew briefing before starting the match");
      const snapshot = this.lobby();
      if (!snapshot.canStart)
        throw new Error("Every configured seat must join and ready up");
      if (this.#match.rulesState.kind !== "unstarted")
        throw new Error("Match already started");
      const now = this.#now();
      const workflow = structuredClone(this.#match.workflow);
      const state = createCoreMatch({
        matchId: this.matchId,
        seed: randomId("seed", 16),
        factionsEnabled: workflow.factionsEnabled,
        seats: workflow.seats.map((seat) => ({
          id: seat.seatId,
          name: seat.displayName!,
          color: seat.color,
          emblem: seat.pattern,
        })),
      });
      workflow.phase = {
        phaseId: randomId("phase"),
        epoch: workflow.phase.epoch + 1,
        kind: "open-water",
        round: 1,
        pulse: null,
        paused: false,
        pauseReason: null,
        endsAtServerMs: now + workflow.planningSeconds * 1_000,
        finalLockAtServerMs:
          now + Math.max(30, workflow.planningSeconds - 35) * 1_000,
        remainingMs: null,
      };
      for (const seat of workflow.seats) {
        workflow.drafts[seat.seatId] = {
          revision: 0,
          locked: false,
          plan: emptyPlan(),
          valid: true,
          invalidReasons: [],
          reservedSupply: 0,
          reservedSignal: 0,
        };
        workflow.socialCommands[seat.seatId] = 0;
      }
      this.#prepareBotDrafts(workflow, state);
      this.#commitRules(
        workflow,
        state,
        [
          {
            id: randomId("event-match-started"),
            kind: "match.started",
            round: 1,
            pulse: null,
            stage: 0,
            ordinal: 0,
            visibility: "public",
            audienceSeatIds: [],
            data: { playerCount: workflow.playerCount },
          },
        ],
        null,
        "active",
      );
      this.#store.createSnapshot(this.matchId, now);
      this.#publish();
    });
  }

  public handleCommand(
    session: SessionRecord,
    command: CommandEnvelope,
  ): Promise<CommandResult> {
    return this.run(async () => {
      const phase = this.#match.workflow.phase;
      if (
        !phase.paused &&
        phase.kind === "open-water" &&
        phase.endsAtServerMs !== null &&
        phase.endsAtServerMs <= this.#now()
      ) {
        await this.#beginResolutionRaw(this.#now());
      }
      const result = this.#store.executeIdempotentCommand({
        matchId: this.matchId,
        sessionId: session.sessionId,
        commandId: command.commandId,
        request: command,
        resultSchema: CommandResultSchema,
        nowMs: this.#now(),
        handler: () => this.#applyCommand(session, command),
      });
      this.#reload();
      this.#publish();
      if (
        result.disposition === "applied" &&
        result.result.status === "accepted" &&
        this.#allDraftsLocked()
      ) {
        await this.#beginResolutionRaw(this.#now());
      }
      return result.disposition === "duplicate"
        ? CommandResultSchema.parse({ ...result.result, status: "duplicate" })
        : result.result;
    });
  }

  public hostControl(
    session: SessionRecord,
    action:
      "pause" | "resume" | "extend" | "close-planning" | "skip-presentation",
    additionalMs = 0,
  ): Promise<void> {
    return this.run(async () => {
      this.#assertHostSession(session);
      if (this.#match.workflow.briefing.active && action !== "pause")
        throw new Error("End the crew briefing before changing the game phase");
      if (action === "pause") this.#pauseRaw("host-choice");
      else if (action === "resume") this.#resumeRaw();
      else if (action === "extend") this.#extendRaw(additionalMs);
      else if (action === "close-planning")
        await this.#beginResolutionRaw(this.#now());
      else if (action === "skip-presentation")
        await this.#finishPresentationRaw(this.#now());
      this.#publish();
    });
  }

  public tick(now = this.#now()): Promise<void> {
    return this.run(async () => {
      const phase = this.#match.workflow.phase;
      if (phase.paused) return;
      if (
        phase.kind === "open-water" &&
        phase.endsAtServerMs !== null &&
        phase.endsAtServerMs <= now
      ) {
        await this.#beginResolutionRaw(now);
        return;
      }
      if (
        phase.kind === "resolution" &&
        this.#match.workflow.presentation.currentBeatEndsAtServerMs !== null &&
        this.#match.workflow.presentation.currentBeatEndsAtServerMs <= now
      ) {
        await this.#advancePresentationRaw(now);
        return;
      }
      if (now - this.#match.heartbeatAtMs >= 5_000)
        this.#touchHeartbeatRaw(now);
    });
  }

  #applyCommand(
    session: SessionRecord,
    command: CommandEnvelope,
  ): CommandResult {
    if (
      command.matchId !== this.matchId ||
      command.phaseId !== this.#match.workflow.phase.phaseId
    ) {
      return rejected(command.commandId, "PHASE_CLOSED", false);
    }
    if (command.sessionEpoch !== session.sessionEpoch)
      return rejected(command.commandId, "SESSION_REVOKED", false);
    if (this.#match.workflow.phase.paused && !isHostCommand(command)) {
      return rejected(command.commandId, "PHASE_PAUSED", true);
    }
    if (isHostCommand(command))
      return this.#applyHostSocketCommand(session, command);
    this.#assertPlayerSession(session);
    const seatId = session.seatId!;
    const seatRecord = this.#store
      .listSeats(this.matchId)
      .find((seat) => seat.seatId === seatId);
    if (
      !seatRecord ||
      !this.#store.verifyWriterLease({
        matchId: this.matchId,
        seatId,
        clientInstanceId: command.clientInstanceId,
        writerLeaseId: command.writerLeaseId,
        controllerEpoch: seatRecord.controllerEpoch,
      })
    ) {
      return rejected(command.commandId, "WRITER_LEASE_REVOKED", false);
    }
    if (this.#match.rulesState.kind !== "active")
      return rejected(command.commandId, "PHASE_CLOSED", false);
    // Seat-authored mutations are a planning-phase surface. In particular,
    // social commands must never mutate the already-resolved canonical state
    // while its presentation is still playing.
    if (this.#match.workflow.phase.kind !== "open-water") {
      return rejected(command.commandId, "PHASE_CLOSED", false);
    }
    if (
      (command.type.startsWith("deal.") || command.type.startsWith("intel.")) &&
      (this.#match.workflow.socialCommands[seatId] ?? 0) >= 24
    ) {
      return rejected(command.commandId, "RATE_LIMITED", true);
    }

    try {
      if (
        command.type === "draft.replace" ||
        command.type === "draft.lock" ||
        command.type === "draft.unlock"
      ) {
        return this.#applyDraftCommand(command, seatId);
      }
      if (
        command.type === "deal.create" ||
        command.type === "deal.accept" ||
        command.type === "deal.withdraw"
      ) {
        return this.#applyDealCommand(command, seatId);
      }
      if (
        command.type === "intel.seal" ||
        command.type === "intel.forward" ||
        command.type === "intel.statement" ||
        command.type === "intel.broadcast"
      ) {
        return this.#applyIntelCommand(command, seatId);
      }
      throw new Error("Unsupported command type");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid command";
      const resource = /insufficient|overspend|available/i.test(message);
      return rejected(
        command.commandId,
        resource ? "INSUFFICIENT_AVAILABLE_RESOURCE" : "INVALID_INTENT",
        false,
      );
    }
  }

  #applyDraftCommand(
    command: Extract<
      CommandEnvelope,
      { type: "draft.replace" | "draft.lock" | "draft.unlock" }
    >,
    seatId: string,
  ): CommandResult {
    if (this.#match.workflow.phase.kind !== "open-water")
      return rejected(command.commandId, "PHASE_CLOSED", false);
    const current = this.#match.workflow.drafts[seatId];
    if (!current || command.expected.revision !== current.revision) {
      return rejected(
        command.commandId,
        "STALE_DRAFT",
        true,
        current?.revision,
      );
    }
    const workflow = structuredClone(this.#match.workflow);
    const nextDraft = workflow.drafts[seatId]!;
    if (command.type === "draft.unlock") {
      nextDraft.locked = false;
      nextDraft.revision += 1;
    } else {
      const state = structuredClone(
        (this.#match.rulesState as { kind: "active"; state: RulesState }).state,
      );
      const program = toProgram(seatId, command.payload.plan);
      const validation = validateProgram(state, seatId, program);
      if (!validation.valid) {
        return rejected(
          command.commandId,
          "INVALID_INTENT",
          false,
          current.revision,
        );
      }
      nextDraft.plan = command.payload.plan;
      nextDraft.valid = true;
      nextDraft.invalidReasons = [];
      nextDraft.reservedSupply = validation.reservedSupply;
      nextDraft.reservedSignal = validation.reservedSignal;
      nextDraft.locked = command.type === "draft.lock";
      nextDraft.revision += 1;
    }
    this.#commitWorkflow(workflow);
    return accepted(command.commandId, "draft", nextDraft.revision);
  }

  #applyDealCommand(
    command: Extract<
      CommandEnvelope,
      { type: "deal.create" | "deal.accept" | "deal.withdraw" }
    >,
    seatId: string,
  ): CommandResult {
    const workflow = structuredClone(this.#match.workflow);
    if (command.type === "deal.create") {
      const payload = command.payload;
      // Conditional contracts are reserved in the wire vocabulary for a
      // future ruleset. V1 implements only atomic trades and honor-system
      // handshakes, so never silently reinterpret a contract as either one.
      if (
        payload.mode === "contract" ||
        payload.term.kind === "conditional-payment"
      ) {
        return rejected(command.commandId, "INVALID_INTENT", false);
      }
      if (payload.expiresAtPhaseId !== workflow.phase.phaseId) {
        return rejected(command.commandId, "PHASE_CLOSED", false);
      }
      if (
        payload.recipientSeatId === seatId ||
        !this.#seatExists(payload.recipientSeatId)
      ) {
        return rejected(command.commandId, "INVALID_INTENT", false);
      }
      const pendingBySeat = Object.values(workflow.offers).filter(
        (offer) =>
          offer.proposerSeatId === seatId && offer.status === "pending",
      ).length;
      if (pendingBySeat >= 8)
        return rejected(command.commandId, "RATE_LIMITED", true);
      if (
        payload.mode !== "handshake" &&
        bundleEmpty(payload.give) &&
        bundleEmpty(payload.receive)
      ) {
        return rejected(command.commandId, "INVALID_INTENT", false);
      }
      const expectedDestinations = new Set(payload.receive.specimenIds);
      if (
        payload.proposerSpecimenDestinations.length !==
          expectedDestinations.size ||
        payload.proposerSpecimenDestinations.some(
          (item) => !expectedDestinations.has(item.specimenId),
        )
      ) {
        return rejected(command.commandId, "INVALID_INTENT", false);
      }
      const offerId = randomId("offer");
      workflow.offers[offerId] = {
        offerId,
        revision: 0,
        proposerSeatId: seatId,
        recipientSeatId: payload.recipientSeatId,
        mode: payload.mode,
        give: payload.give,
        receive: payload.receive,
        proposerSpecimenDestinations: payload.proposerSpecimenDestinations,
        term: payload.term,
        status: "pending",
        expiresAtPhaseId: this.#match.workflow.phase.phaseId,
      };
      workflow.socialCommands[seatId] =
        (workflow.socialCommands[seatId] ?? 0) + 1;
      this.#commitWorkflow(workflow);
      return accepted(command.commandId, "offer", 0);
    }

    const offer = workflow.offers[command.expected.offerId];
    if (!offer || offer.revision !== command.expected.revision) {
      return rejected(command.commandId, "STALE_OFFER", true, offer?.revision);
    }
    if (command.type === "deal.withdraw") {
      if (offer.proposerSeatId !== seatId || offer.status !== "pending") {
        return rejected(command.commandId, "NOT_AUTHORIZED", false);
      }
      offer.status = "withdrawn";
      offer.revision += 1;
      workflow.socialCommands[seatId] =
        (workflow.socialCommands[seatId] ?? 0) + 1;
      this.#commitWorkflow(workflow);
      return accepted(command.commandId, "offer", offer.revision);
    }
    if (offer.recipientSeatId !== seatId || offer.status !== "pending") {
      return rejected(command.commandId, "NOT_AUTHORIZED", false);
    }
    const expectedDestinations = new Set(offer.give.specimenIds);
    if (
      command.payload.specimenDestinations.length !==
        expectedDestinations.size ||
      command.payload.specimenDestinations.some(
        (item) => !expectedDestinations.has(item.specimenId),
      )
    ) {
      return rejected(command.commandId, "INVALID_INTENT", false);
    }
    let state = (
      this.#match.rulesState as { kind: "active"; state: RulesState }
    ).state;
    const events: CanonicalEvent[] = [];
    if (!bundleEmpty(offer.give) || !bundleEmpty(offer.receive)) {
      const transfers = [
        ...buildTransfers(
          state,
          offer.give,
          offer.proposerSeatId,
          offer.recipientSeatId,
          command.payload.specimenDestinations,
        ),
        ...buildTransfers(
          state,
          offer.receive,
          offer.recipientSeatId,
          offer.proposerSeatId,
          offer.proposerSpecimenDestinations,
        ),
      ];
      const transition = settleAtomicTrade(
        state,
        offer.offerId,
        transfers,
        offer.mode === "contract",
      );
      ensureDraftsRemainValid(transition.stateAfter, workflow);
      state = transition.stateAfter;
      events.push(...transition.events);
    }
    if (offer.mode === "handshake") {
      const transition = recordHandshake(
        state,
        offer.offerId,
        [offer.proposerSeatId, offer.recipientSeatId],
        offer.term.sectorIds,
        {
          prohibitHunt: offer.term.kind === "ceasefire",
          prohibitRaid: offer.term.kind === "ceasefire",
          safePassageDevices: offer.term.kind === "safe-passage",
        },
      );
      state = transition.stateAfter;
      events.push(...transition.events);
    }
    offer.status = "fulfilled";
    offer.revision += 1;
    workflow.socialCommands[seatId] =
      (workflow.socialCommands[seatId] ?? 0) + 1;
    this.#commitRules(workflow, state, events, command.commandId);
    return accepted(command.commandId, "offer", offer.revision);
  }

  #applyIntelCommand(
    command: Extract<
      CommandEnvelope,
      {
        type:
          | "intel.seal"
          | "intel.forward"
          | "intel.statement"
          | "intel.broadcast";
      }
    >,
    seatId: string,
  ): CommandResult {
    let state = (
      this.#match.rulesState as { kind: "active"; state: RulesState }
    ).state;
    const events: CanonicalEvent[] = [];
    if (command.type === "intel.seal") {
      if (
        Object.values(state.reports).some(
          (report) =>
            report.kind === "sealed" &&
            report.observationId === command.payload.contactId &&
            report.parentReportId === null,
        )
      ) {
        throw new Error("Observation is already sealed");
      }
      const transition = sealObservation(
        state,
        seatId,
        command.payload.contactId,
      );
      state = transition.stateAfter;
      events.push(...transition.events);
    } else if (command.type === "intel.forward") {
      for (const recipient of command.payload.recipients) {
        const source = state.reports[command.payload.reportId];
        const included =
          source?.kind === "sealed"
            ? source.fields.filter(
                (field) =>
                  !command.payload.redactedFields.includes(field as never),
              )
            : undefined;
        const transition = forwardReport(
          state,
          seatId,
          recipient,
          command.payload.reportId,
          included,
        );
        state = transition.stateAfter;
        events.push(...transition.events);
      }
    } else if (command.type === "intel.statement") {
      const statement = command.payload.statement;
      const parts = [
        statement.note,
        statement.contactCount === null
          ? null
          : `${statement.contactCount} contact(s)`,
        statement.contactClass,
        statement.identitySeatId
          ? `identity ${statement.identitySeatId}`
          : null,
        statement.direction ? `heading ${statement.direction}` : null,
      ].filter((part): part is string => Boolean(part));
      const transition = createStatement(
        state,
        seatId,
        command.payload.recipients,
        parts.join(" · ") || "No contact detected",
        statement.sectorId,
      );
      state = transition.stateAfter;
      events.push(...transition.events);
    } else {
      let reportId = command.payload.reportId;
      const source = state.reports[reportId];
      if (
        source?.kind === "sealed" &&
        command.payload.redactedFields.length > 0
      ) {
        const included = source.fields.filter(
          (field) => !command.payload.redactedFields.includes(field as never),
        );
        const redacted = forwardReport(
          state,
          seatId,
          seatId,
          reportId,
          included,
        );
        state = redacted.stateAfter;
        events.push(...redacted.events);
        reportId =
          Object.keys(state.reports)
            .filter(
              (id) =>
                id !== command.payload.reportId &&
                state.reports[id]?.parentReportId === command.payload.reportId,
            )
            .sort()
            .at(-1) ?? reportId;
      }
      const transition = broadcastReport(state, seatId, reportId);
      state = transition.stateAfter;
      events.push(...transition.events);
    }
    const workflow = structuredClone(this.#match.workflow);
    workflow.socialCommands[seatId] =
      (workflow.socialCommands[seatId] ?? 0) + 1;
    this.#commitRules(workflow, state, events, command.commandId);
    return accepted(command.commandId, "intel", this.#match.rulesRevision + 1);
  }

  #applyHostSocketCommand(
    session: SessionRecord,
    command: HostCommand,
  ): CommandResult {
    this.#assertHostSession(session);
    if (this.#match.workflow.briefing.active && command.type !== "host.pause")
      return rejected(command.commandId, "INVALID_INTENT", false);
    if (command.expected.epoch !== this.#match.workflow.phase.epoch) {
      return rejected(
        command.commandId,
        "PHASE_CLOSED",
        true,
        this.#match.workflow.phase.epoch,
      );
    }
    if (command.type === "host.pause") this.#pauseRaw("host-choice");
    else if (command.type === "host.resume") this.#resumeRaw();
    else if (command.type === "host.extend")
      this.#extendRaw(command.payload.additionalMs);
    // These two transitions cross a durable resolution boundary and are
    // intentionally available only through the awaited REST host controls.
    // A synchronous receipt transaction must never acknowledge them before
    // the round input/batch and canonical state are committed.
    else if (
      command.type === "host.closePlanning" ||
      command.type === "host.skipPresentation"
    )
      return rejected(command.commandId, "INVALID_INTENT", false);
    else return rejected(command.commandId, "INVALID_INTENT", false);
    return accepted(
      command.commandId,
      "phase",
      this.#match.workflow.phase.epoch,
    );
  }

  async #beginResolutionRaw(now: number): Promise<void> {
    if (
      this.#match.lifecycle !== "active" ||
      this.#match.workflow.phase.kind !== "open-water"
    )
      return;
    if (this.#match.rulesState.kind !== "active") return;
    const stateBefore = this.#match.rulesState.state;
    const programs = Object.fromEntries(
      this.#match.workflow.seats.map((seat) => [
        seat.seatId,
        toProgram(
          seat.seatId,
          this.#match.workflow.drafts[seat.seatId]?.plan ?? emptyPlan(),
        ),
      ]),
    );
    const input = freezeRoundInput(stateBefore, programs);
    const resolutionId = randomId(`resolution-r${stateBefore.round}`);
    this.#store.putRoundInput({
      resolutionId,
      matchId: this.matchId,
      roundNumber: stateBefore.round,
      payload: input,
      createdAtMs: now,
    });
    const resolution = resolveRoundInput(input);
    const claim = runClaimCheck(resolution.stateAfter);
    const stateAfter = claim.stateAfter;
    const events = [...resolution.events, ...claim.events];
    const workflow = structuredClone(this.#match.workflow);
    workflow.phase = {
      phaseId: randomId("phase"),
      epoch: workflow.phase.epoch + 1,
      kind: "resolution",
      round: stateBefore.round,
      pulse: 1,
      paused: false,
      pauseReason: null,
      endsAtServerMs: null,
      finalLockAtServerMs: null,
      remainingMs: null,
    };
    workflow.presentation = {
      resolutionId,
      cursor: 0,
      beatCount: RESOLUTION_BEAT_COUNT,
      timelineSeq: workflow.presentation.timelineSeq + 1,
      paused: false,
      currentBeatId: `beat-r${stateBefore.round}-p1`,
      currentBeatEndsAtServerMs: now + BEAT_DURATION_MS,
      stateBefore,
      pulseStates: resolution.pulseStates,
      claimState: stateAfter,
      events,
    };
    this.#revealCurrentPrivateResults(workflow);
    this.#commitRules(workflow, stateAfter, events, null);
    this.#store.putResolutionBatch({
      resolutionId,
      matchId: this.matchId,
      schemaVersion: 2,
      payload: {
        stateBefore,
        pulseStates: resolution.pulseStates,
        claimState: stateAfter,
        events,
      },
      createdAtMs: now,
    });
    this.#store.commitRoundInput(resolutionId, rulesStateHash(stateAfter), now);
    this.#store.createSnapshot(this.matchId, now);
    this.#publish();
  }

  async #advancePresentationRaw(now: number): Promise<void> {
    const workflow = structuredClone(this.#match.workflow);
    workflow.presentation.cursor += 1;
    if (workflow.presentation.cursor >= workflow.presentation.beatCount) {
      await this.#finishPresentationRaw(now);
      return;
    }
    workflow.presentation.timelineSeq += 1;
    workflow.presentation.currentBeatId = beatIdFor(
      workflow.phase.round,
      workflow.presentation.cursor,
    );
    workflow.presentation.currentBeatEndsAtServerMs = now + BEAT_DURATION_MS;
    workflow.phase.pulse = presentationPulse(workflow.presentation.cursor);
    this.#revealCurrentPrivateResults(workflow);
    this.#commitWorkflow(workflow);
    this.#publish();
  }

  async #finishPresentationRaw(now: number): Promise<void> {
    if (
      this.#match.workflow.phase.kind !== "resolution" ||
      this.#match.rulesState.kind !== "active"
    )
      return;
    let state = this.#match.rulesState.state;
    let workflow = structuredClone(this.#match.workflow);
    if (state.phase === "ended") {
      workflow.phase = {
        phaseId: randomId("phase"),
        epoch: workflow.phase.epoch + 1,
        kind: "game-over",
        round: state.round,
        pulse: null,
        paused: false,
        pauseReason: null,
        endsAtServerMs: null,
        finalLockAtServerMs: null,
        remainingMs: null,
      };
      workflow.presentation = emptyPresentation(
        workflow.presentation.timelineSeq + 1,
      );
      this.#commitWorkflow(workflow, "finished");
      this.#publish();
      return;
    }
    if (state.phase !== "forecast")
      throw new Error("Resolved state did not enter Forecast");
    const forecast = runForecast(state);
    state = forecast.stateAfter;
    workflow = structuredClone(this.#match.workflow);
    workflow.phase = {
      phaseId: randomId("phase"),
      epoch: workflow.phase.epoch + 1,
      kind: "open-water",
      round: state.round,
      pulse: null,
      paused: false,
      pauseReason: null,
      endsAtServerMs: now + workflow.planningSeconds * 1_000,
      finalLockAtServerMs:
        now + Math.max(30, workflow.planningSeconds - 35) * 1_000,
      remainingMs: null,
    };
    workflow.presentation = emptyPresentation(
      workflow.presentation.timelineSeq + 1,
    );
    for (const seat of workflow.seats) {
      workflow.drafts[seat.seatId] = {
        revision: (workflow.drafts[seat.seatId]?.revision ?? 0) + 1,
        locked: false,
        plan: emptyPlan(),
        valid: true,
        invalidReasons: [],
        reservedSupply: 0,
        reservedSignal: 0,
      };
      workflow.socialCommands[seat.seatId] = 0;
    }
    for (const offer of Object.values(workflow.offers)) {
      if (offer.status === "pending") {
        offer.status = "expired";
        offer.revision += 1;
      }
    }
    this.#prepareBotDrafts(workflow, state);
    this.#commitRules(workflow, state, forecast.events, null);
    this.#store.createSnapshot(this.matchId, now);
    this.#publish();
  }

  #pauseRaw(
    reason:
      "display-lost" | "technical" | "host-choice" | "restart" | "runtime-gap",
    referenceMs = this.#now(),
  ): void {
    if (this.#match.lifecycle !== "active" || this.#match.workflow.phase.paused)
      return;
    const workflow = structuredClone(this.#match.workflow);
    workflow.phase.remainingMs = workflow.phase.endsAtServerMs
      ? Math.max(0, workflow.phase.endsAtServerMs - referenceMs)
      : workflow.presentation.currentBeatEndsAtServerMs
        ? Math.max(
            0,
            workflow.presentation.currentBeatEndsAtServerMs - referenceMs,
          )
        : null;
    workflow.phase.endsAtServerMs = null;
    workflow.phase.paused = true;
    workflow.phase.pauseReason = reason;
    workflow.phase.epoch += 1;
    workflow.presentation.paused = workflow.phase.kind === "resolution";
    workflow.presentation.currentBeatEndsAtServerMs = null;
    this.#commitWorkflow(workflow);
  }

  #touchHeartbeatRaw(now: number): void {
    this.#match = this.#store.commitMatch({
      matchId: this.matchId,
      expectedRulesRevision: this.#match.rulesRevision,
      expectedWorkflowRevision: this.#match.workflowRevision,
      rulesState: this.#match.rulesState,
      workflow: this.#match.workflow,
      lifecycle: this.#match.lifecycle,
      heartbeatAtMs: now,
    });
  }

  #resumeRaw(): void {
    if (
      this.#match.lifecycle !== "active" ||
      !this.#match.workflow.phase.paused
    )
      return;
    const workflow = structuredClone(this.#match.workflow);
    const now = this.#now();
    const remaining = workflow.phase.remainingMs ?? 0;
    workflow.phase.paused = false;
    workflow.phase.pauseReason = null;
    workflow.phase.epoch += 1;
    workflow.phase.remainingMs = null;
    if (workflow.phase.kind === "open-water")
      workflow.phase.endsAtServerMs = now + remaining;
    if (workflow.phase.kind === "resolution") {
      workflow.presentation.paused = false;
      workflow.presentation.currentBeatEndsAtServerMs =
        now + Math.max(remaining, 100);
    }
    this.#commitWorkflow(workflow);
  }

  #extendRaw(additionalMs: number): void {
    if (this.#match.workflow.phase.kind !== "open-water")
      throw new Error("Planning is not active");
    if (
      !Number.isInteger(additionalMs) ||
      additionalMs < 5_000 ||
      additionalMs > 120_000
    ) {
      throw new Error("Extension must be 5–120 seconds");
    }
    const workflow = structuredClone(this.#match.workflow);
    if (workflow.phase.paused)
      workflow.phase.remainingMs =
        (workflow.phase.remainingMs ?? 0) + additionalMs;
    else
      workflow.phase.endsAtServerMs =
        (workflow.phase.endsAtServerMs ?? this.#now()) + additionalMs;
    workflow.phase.epoch += 1;
    this.#commitWorkflow(workflow);
  }

  #revealCurrentPrivateResults(workflow: WorkflowState): void {
    for (const event of eventsForPresentationBeat(workflow)) {
      if (event.visibility !== "private") continue;
      for (const seatId of event.audienceSeatIds) {
        const cards = workflow.resultCards[seatId] ?? [];
        if (cards.some((card) => card.resultId === event.id)) continue;
        cards.push({
          resultId: event.id,
          round: event.round,
          pulse: event.pulse ?? 3,
          title: humanizeEventKind(event.kind),
          detail:
            JSON.stringify(event.data).slice(0, 400) ||
            "Private instrument update",
          reportId:
            typeof event.data.reportId === "string"
              ? event.data.reportId
              : null,
          acknowledged: false,
        });
        workflow.resultCards[seatId] = cards.slice(-64);
      }
    }
  }

  #commitWorkflow(
    workflow: WorkflowState,
    lifecycle = this.#match.lifecycle,
  ): void {
    const rules = this.#match.rulesState;
    this.#match = this.#store.commitMatch({
      matchId: this.matchId,
      expectedRulesRevision: this.#match.rulesRevision,
      expectedWorkflowRevision: this.#match.workflowRevision,
      rulesState: PersistedRulesSchema.parse(rules),
      workflow: WorkflowStateSchema.parse(workflow),
      lifecycle,
      heartbeatAtMs: this.#now(),
    });
  }

  #commitRules(
    workflow: WorkflowState,
    state: RulesState,
    events: CanonicalEvent[],
    commandId: string | null,
    lifecycle = this.#match.lifecycle,
  ): void {
    this.#match = this.#store.commitMatch({
      matchId: this.matchId,
      expectedRulesRevision: this.#match.rulesRevision,
      expectedWorkflowRevision: this.#match.workflowRevision,
      rulesState: { kind: "active", state },
      workflow: WorkflowStateSchema.parse(workflow),
      lifecycle,
      publicVersion: this.#match.publicVersion + 1,
      hostVersion: this.#match.hostVersion + 1,
      heartbeatAtMs: this.#now(),
      events: events.map((event) => ({
        eventId: event.id,
        eventType: event.kind,
        payload: event,
        commandId,
      })),
    });
  }

  #reload(): void {
    const match = this.#store.getMatch(this.matchId);
    if (!match) throw new Error("Match disappeared");
    this.#match = match;
  }

  #visibleState(): RulesState | null {
    if (this.#match.rulesState.kind !== "active") return null;
    if (this.#match.workflow.phase.kind === "resolution") {
      const presentation = this.#match.workflow.presentation;
      const pulse = presentationPulse(presentation.cursor);
      if (pulse !== null && presentation.pulseStates?.[pulse]) {
        return presentation.pulseStates[pulse];
      }
      if (pulse === null && presentation.claimState) {
        return presentation.claimState;
      }
      if (presentation.stateBefore) return presentation.stateBefore;
    }
    return this.#match.rulesState.state;
  }

  #currentCaption(): string | null {
    if (this.#match.workflow.phase.kind !== "resolution") return null;
    const cursor = this.#match.workflow.presentation.cursor;
    const pulse = presentationPulse(cursor);
    const label = pulse === null ? "Claim Check" : `Pulse ${pulse}`;
    const publicEvents = eventsForPresentationBeat(this.#match.workflow).filter(
      (event) => event.visibility === "public",
    );
    if (publicEvents.length === 0) return `${label} — quiet water`;
    const kinds = [...new Set(publicEvents.map((event) => event.kind))];
    const summary = kinds.slice(0, 2).map(humanizeEventKind).join(" · ");
    const more = kinds.length > 2 ? ` · +${kinds.length - 2} more` : "";
    return `${label} — ${summary}${more}`;
  }

  #allDraftsLocked(): boolean {
    return (
      this.#match.lifecycle === "active" &&
      this.#match.workflow.phase.kind === "open-water" &&
      this.#match.workflow.seats.every(
        (seat) => this.#match.workflow.drafts[seat.seatId]?.locked,
      )
    );
  }

  #prepareBotDrafts(workflow: WorkflowState, state: RulesState): boolean {
    if (workflow.phase.kind !== "open-water") return false;
    let changed = false;
    for (const [seatId, bot] of Object.entries(workflow.bots).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const draft = workflow.drafts[seatId];
      if (!draft || draft.locked) continue;
      const projectedMatch: MatchRecord<PersistedRules, WorkflowState> = {
        ...this.#match,
        rulesState: { kind: "active", state },
        workflow,
      };
      let selectedPlan = emptyPlan();
      let validation = validateProgram(
        state,
        seatId,
        toProgram(seatId, selectedPlan),
      );
      try {
        const projection = playerProjection({
          match: projectedMatch,
          state,
          seatId,
          presence: this.#presence(),
          caption: null,
        });
        const candidate = DraftPlanSchema.parse(
          planBotTurn(projection, bot.strategy),
        );
        const candidateValidation = validateProgram(
          state,
          seatId,
          toProgram(seatId, candidate),
        );
        // Canonical state is only a safety gate. The planner never receives it
        // and does not retry based on validation feedback.
        if (candidateValidation.valid) {
          selectedPlan = candidate;
          validation = candidateValidation;
        }
      } catch {
        // Three Holds are always the durable fail-safe for a policy defect.
      }
      draft.plan = selectedPlan;
      draft.valid = true;
      draft.invalidReasons = [];
      draft.reservedSupply = validation.reservedSupply;
      draft.reservedSignal = validation.reservedSignal;
      draft.locked = true;
      draft.revision += 1;
      changed = true;
    }
    return changed;
  }

  #presence(): PresenceView {
    const now = this.#now();
    const connections = [...this.#connections.values()];
    const playerConnections = connections.filter(
      (connection) => connection.role === "player",
    );
    const bySession = new Map<string, ConnectionState>();
    for (const connection of connections.sort(
      (a, b) =>
        Number(b.transport === "websocket") -
          Number(a.transport === "websocket") ||
        b.connectedAtMs - a.connectedAtMs,
    )) {
      if (!bySession.has(connection.sessionId))
        bySession.set(connection.sessionId, connection);
    }
    return {
      seatPresence: (seatId) =>
        playerConnections.some((connection) => connection.seatId === seatId)
          ? "connected"
          : "offline",
      displayReady: [...this.#connections.values()].some(
        (connection) => connection.role === "display",
      ),
      clients: [...bySession.values()]
        .sort((a, b) => b.connectedAtMs - a.connectedAtMs)
        .slice(0, 10)
        .map((connection) => ({
          sessionId: connection.sessionId,
          role: connection.role,
          seatId: connection.seatId,
          presence: "connected",
          transport: connection.transport,
          rttMs: null,
          buildId: this.#config.buildId,
          protocol: 1,
          lastSeenAtMs: Math.max(connection.connectedAtMs, now),
        })),
    };
  }

  #seatExists(seatId: string): boolean {
    return this.#match.workflow.seats.some(
      (seat) => seat.seatId === seatId && seat.displayName !== null,
    );
  }

  #assertPlayerSession(session: SessionRecord): void {
    if (
      session.matchId !== this.matchId ||
      session.role !== "player" ||
      !session.seatId
    ) {
      throw new Error("Player session required");
    }
  }

  #assertHostSession(session: SessionRecord): void {
    if (session.matchId !== this.matchId || session.role !== "host")
      throw new Error("Host session required");
  }

  #publish(): void {
    this.#config.onChange(this);
  }

  #now(): number {
    return this.#config.now?.() ?? Date.now();
  }
}

function accepted(
  commandId: string,
  kind: "draft" | "offer" | "phase" | "intel",
  revision: number,
): CommandResult {
  return { status: "accepted", commandId, applied: { kind, revision } };
}

function rejected(
  commandId: string,
  code: Extract<CommandResult, { status: "rejected" }>["code"],
  retryable: boolean,
  currentRelevantRevision?: number,
): CommandResult {
  return {
    status: "rejected",
    commandId,
    code,
    retryable,
    ...(currentRelevantRevision === undefined
      ? {}
      : { currentRelevantRevision }),
  };
}

function toProgram(
  seatId: string,
  plan: {
    operations: readonly unknown[];
    secondDawnSalvagePriority?: string[] | undefined;
  },
): ThreePulseProgram {
  return {
    seatId,
    operations: structuredClone(plan.operations) as [
      Operation,
      Operation,
      Operation,
    ],
    ...(plan.secondDawnSalvagePriority
      ? { secondDawnSalvagePriority: [...plan.secondDawnSalvagePriority] }
      : {}),
  };
}

type HostCommand = Extract<
  CommandEnvelope,
  {
    type:
      | "host.pause"
      | "host.resume"
      | "host.extend"
      | "host.closePlanning"
      | "host.skipPresentation"
      | "host.reclaimSeat";
  }
>;

function isHostCommand(command: CommandEnvelope): command is HostCommand {
  return command.type.startsWith("host.");
}

function bundleEmpty(bundle: {
  supply: number;
  signal: number;
  reportIds: string[];
  specimenIds: string[];
}): boolean {
  return (
    bundle.supply === 0 &&
    bundle.signal === 0 &&
    bundle.reportIds.length === 0 &&
    bundle.specimenIds.length === 0
  );
}

function buildTransfers(
  state: RulesState,
  bundle: {
    supply: number;
    signal: number;
    reportIds: string[];
    specimenIds: string[];
  },
  fromSeatId: string,
  toSeatId: string,
  destinations: Array<{ specimenId: string; toSubmarineId: string }>,
): TradeTransfer[] {
  const transfers: TradeTransfer[] = [];
  if (bundle.supply > 0)
    transfers.push({
      kind: "supply",
      fromSeatId,
      toSeatId,
      amount: bundle.supply,
    });
  if (bundle.signal > 0)
    transfers.push({
      kind: "signal",
      fromSeatId,
      toSeatId,
      amount: bundle.signal,
    });
  for (const reportId of bundle.reportIds)
    transfers.push({ kind: "report", fromSeatId, toSeatId, reportId });
  const incomingByDestination = new Map<string, number>();
  for (const specimenId of bundle.specimenIds) {
    const sources = Object.values(state.assets).filter(
      (asset) =>
        asset.kind === "submarine" &&
        asset.ownerId === fromSeatId &&
        asset.cargo.includes(specimenId),
    );
    if (sources.length !== 1)
      throw new Error("Specimen must have one owned source submarine");
    const mapping = destinations.find(
      (destination) => destination.specimenId === specimenId,
    );
    const destination = mapping ? state.assets[mapping.toSubmarineId] : null;
    if (
      !mapping ||
      destination?.kind !== "submarine" ||
      destination.ownerId !== toSeatId
    ) {
      throw new Error("Specimen destination is invalid");
    }
    const pending = (incomingByDestination.get(destination.id) ?? 0) + 1;
    if (
      destination.cargo.length + pending > 2 ||
      destination.sectorId !== sources[0]!.sectorId
    ) {
      throw new Error("Specimen handoff requires co-located cargo capacity");
    }
    incomingByDestination.set(destination.id, pending);
    transfers.push({
      kind: "specimen",
      fromSeatId,
      toSeatId,
      fromSubmarineId: sources[0]!.id,
      toSubmarineId: destination.id,
      specimenId,
    });
  }
  return transfers;
}

function ensureDraftsRemainValid(
  state: RulesState,
  workflow: WorkflowState,
): void {
  for (const seat of workflow.seats) {
    const draft = workflow.drafts[seat.seatId];
    if (!draft) continue;
    const validation = validateProgram(
      state,
      seat.seatId,
      toProgram(seat.seatId, draft.plan),
    );
    if (validation.valid) continue;
    if (
      validation.issues.some(
        (issue) =>
          issue.code === "INSUFFICIENT_SUPPLY" ||
          issue.code === "INSUFFICIENT_SIGNAL",
      )
    ) {
      throw new Error(
        "Insufficient available resource after reserving accepted drafts",
      );
    }
    throw new Error("Trade would invalidate an accepted draft");
  }
}

function emptyPresentation(timelineSeq: number): WorkflowState["presentation"] {
  return {
    resolutionId: null,
    cursor: 0,
    beatCount: 0,
    timelineSeq,
    paused: false,
    currentBeatId: null,
    currentBeatEndsAtServerMs: null,
    stateBefore: null,
    pulseStates: null,
    claimState: null,
    events: [],
  };
}

function presentationPulse(cursor: number): 1 | 2 | 3 | null {
  return cursor === 0 ? 1 : cursor === 1 ? 2 : cursor === 2 ? 3 : null;
}

function beatIdFor(round: number, cursor: number): string {
  const pulse = presentationPulse(cursor);
  return pulse === null ? `beat-r${round}-claim` : `beat-r${round}-p${pulse}`;
}

function eventsForPresentationBeat(workflow: WorkflowState): CanonicalEvent[] {
  const pulse = presentationPulse(workflow.presentation.cursor);
  return workflow.presentation.events.filter((event) =>
    pulse === null ? event.pulse === null : event.pulse === pulse,
  );
}

function humanizeEventKind(kind: string): string {
  return kind.split(/[._]/).map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

function operationKindFromEvent(kind: string): Operation["kind"] {
  const prefix = kind.split(".")[0];
  const operationKinds: Operation["kind"][] = [
    "hold",
    "glide",
    "sprint",
    "navigate",
    "survey",
    "harvest",
    "analyze",
    "develop",
    "deploy",
    "hunt",
    "raid",
    "jam",
    "go_dark",
    "screen",
  ];
  return operationKinds.includes(prefix as Operation["kind"])
    ? (prefix as Operation["kind"])
    : "hold";
}
