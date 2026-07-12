import { describe, expect, it } from "vitest";
import {
  assertRulesInvariants,
  canonicalHash,
  canonicalJson,
  connectedSectors,
  freezeRoundInput,
  projectForSeat,
  resolveRoundInput,
  type RoundInput,
  type RulesState,
} from "../../packages/game-core/src/index.js";
import { allPrograms, createTestMatch, program, submarine } from "./helpers.js";

function reverseRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).reverse());
}

describe("frozen round and reconnect determinism", () => {
  it("replays byte-equivalently after JSON persistence and key reordering", () => {
    const state = createTestMatch(4, "persisted-round-replay");
    const amberSub = submarine(state, "amber");
    const cyanSub = submarine(state, "cyan");
    const amberDestination = connectedSectors(state.map, amberSub.sectorId)[0]!;
    const cyanDestination = connectedSectors(state.map, cyanSub.sectorId)[0]!;
    const plans = allPrograms(state, {
      amber: program("amber", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: amberSub.id,
          requiredSectorId: amberSub.sectorId,
          toSectorId: amberDestination,
          silent: false,
        },
        2: {
          kind: "deploy",
          pulse: 2,
          assetId: amberSub.id,
          requiredSectorId: amberDestination,
          device: "snare",
          snareMode: "tag",
        },
      }),
      cyan: program("cyan", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: cyanSub.id,
          requiredSectorId: cyanSub.sectorId,
          toSectorId: cyanDestination,
          silent: true,
        },
        3: {
          kind: "go_dark",
          pulse: 3,
          assetId: cyanSub.id,
          requiredSectorId: cyanDestination,
        },
      }),
    });
    const frozen = freezeRoundInput(state, plans);
    const persisted = JSON.parse(JSON.stringify(frozen)) as RoundInput;
    const reordered = structuredClone(persisted);
    reordered.stateBefore.seats = reverseRecord(reordered.stateBefore.seats);
    reordered.stateBefore.assets = reverseRecord(reordered.stateBefore.assets);
    reordered.stateBefore.devices = reverseRecord(
      reordered.stateBefore.devices,
    );
    reordered.stateBefore.sites = reverseRecord(
      reordered.stateBefore.sites as unknown as Record<
        string,
        RulesState["sites"][number]
      >,
    ) as unknown as RulesState["sites"];
    reordered.programsBySeat = reverseRecord(reordered.programsBySeat);

    const first = resolveRoundInput(frozen);
    const second = resolveRoundInput(persisted);
    const third = resolveRoundInput(reordered);
    expect(canonicalHash(second)).toBe(canonicalHash(first));
    expect(canonicalHash(third)).toBe(canonicalHash(first));
    expect(canonicalJson(second.events)).toBe(canonicalJson(first.events));
    expect(
      ([1, 2, 3] as const).map((pulse) =>
        canonicalHash(second.pulseStates[pulse]),
      ),
    ).toEqual(
      ([1, 2, 3] as const).map((pulse) =>
        canonicalHash(first.pulseStates[pulse]),
      ),
    );
    expect(new Set(first.events.map((event) => event.id)).size).toBe(
      first.events.length,
    );
  });

  it("captures independent invariant-safe state exactly after each Pulse", () => {
    const state = createTestMatch(3, "pulse-boundary-snapshots");
    const amberSub = submarine(state, "amber");
    amberSub.sectorId = 12;
    const result = resolveRoundInput(
      freezeRoundInput(
        state,
        allPrograms(state, {
          amber: program("amber", {
            1: {
              kind: "glide",
              pulse: 1,
              assetId: amberSub.id,
              requiredSectorId: 12,
              toSectorId: 13,
              silent: false,
            },
            2: {
              kind: "glide",
              pulse: 2,
              assetId: amberSub.id,
              requiredSectorId: 13,
              toSectorId: 18,
              silent: false,
            },
            3: {
              kind: "hold",
              pulse: 3,
              assetId: amberSub.id,
              requiredSectorId: 18,
            },
          }),
        }),
      ),
    );

    for (const pulse of [1, 2, 3] as const) {
      expect(result.pulseStates[pulse].phase).toBe("resolving");
      assertRulesInvariants(result.pulseStates[pulse]);
    }
    expect(submarine(result.pulseStates[1], "amber").sectorId).toBe(13);
    expect(submarine(result.pulseStates[2], "amber").sectorId).toBe(18);
    expect(submarine(result.pulseStates[3], "amber").sectorId).toBe(18);
    expect(Object.keys(result.pulseStates[1].evidence)).toHaveLength(1);
    expect(Object.keys(result.pulseStates[2].evidence)).toHaveLength(2);
    expect(Object.keys(result.pulseStates[3].evidence)).toHaveLength(2);

    const normalizedPulseThree = structuredClone(result.pulseStates[3]);
    normalizedPulseThree.phase = "claim";
    normalizedPulseThree.programEscrows = {};
    expect(canonicalHash(normalizedPulseThree)).toBe(
      canonicalHash(result.stateAfter),
    );
    const finalHash = canonicalHash(result.stateAfter);
    result.pulseStates[1].seats.amber!.signal = 77;
    expect(canonicalHash(result.stateAfter)).toBe(finalHash);
    expect(result.pulseStates[2].seats.amber!.signal).not.toBe(77);
  });

  it("freezes an immutable resolution boundary before live state can mutate", () => {
    const state = createTestMatch(3, "immutable-round-boundary");
    const amberSub = submarine(state, "amber");
    const destination = connectedSectors(state.map, amberSub.sectorId)[0]!;
    const plans = allPrograms(state, {
      amber: program("amber", {
        1: {
          kind: "glide",
          pulse: 1,
          assetId: amberSub.id,
          requiredSectorId: amberSub.sectorId,
          toSectorId: destination,
          silent: true,
        },
      }),
    });
    const input = freezeRoundInput(state, plans);
    const expected = resolveRoundInput(input);

    state.seats.amber!.signal = 99;
    submarine(state, "amber").sectorId = destination;
    plans.amber!.operations[0] = { kind: "hold", pulse: 1 };

    expect(canonicalHash(resolveRoundInput(input))).toBe(
      canonicalHash(expected),
    );
    expect(submarine(input.stateBefore, "amber").sectorId).not.toBe(
      destination,
    );
    expect(input.programsBySeat.amber!.operations[0].kind).toBe("glide");
  });

  it("reconstructs the same private projection from a persisted reconnect snapshot", () => {
    const state = createTestMatch(3, "reconnect-private-snapshot");
    const amberSub = submarine(state, "amber");
    state.programs.amber = program("amber", {
      1: {
        kind: "go_dark",
        pulse: 1,
        assetId: amberSub.id,
        requiredSectorId: amberSub.sectorId,
      },
    });
    state.devices["device-amber-reconnect"] = {
      kind: "decoy",
      id: "device-amber-reconnect",
      ownerId: "amber",
      sectorId: amberSub.sectorId,
      route: [],
      routeIndex: 0,
      state: "armed",
      armedFromPulse: 2,
      armedFromRound: 1,
      expiresAfterRound: 2,
    };
    state.seats.amber!.deviceInventory.decoy = 0;
    const beforeDisconnect = projectForSeat(state, "amber");
    const persisted = JSON.parse(JSON.stringify(state)) as RulesState;
    const afterReconnect = projectForSeat(persisted, "amber");

    expect(canonicalJson(afterReconnect)).toBe(canonicalJson(beforeDisconnect));
    expect(afterReconnect.program?.operations[0].kind).toBe("go_dark");
    expect(afterReconnect.devices[0]?.id).toBe("device-amber-reconnect");
  });

  it("rejects a persisted input whose metadata does not match its snapshot", () => {
    const state = createTestMatch(3, "corrupt-round-metadata");
    const input = freezeRoundInput(state, allPrograms(state));
    input.round += 1;
    expect(() => resolveRoundInput(input)).toThrow(/metadata/);
  });
});
