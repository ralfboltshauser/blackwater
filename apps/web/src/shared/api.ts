import { io, type Socket } from "socket.io-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BriefingState,
  CommandEnvelope,
  CommandResult,
  ProjectionEnvelope,
} from "@blackwater/protocol";
import {
  BriefingStateSchema,
  DEFAULT_BRIEFING_STATE,
} from "@blackwater/protocol";

export type ApiErrorShape = {
  error: string;
  code?: string;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response
    .json()
    .catch(() => ({ error: response.statusText }))) as T | ApiErrorShape;
  if (!response.ok) {
    const error = body as ApiErrorShape;
    throw new Error(error.error || `Request failed (${response.status})`);
  }
  return body as T;
}

type ViewerRole = "public" | "player" | "host";

export type RealtimeState<T> = {
  projection: T | null;
  connected: boolean;
  recovered: boolean;
  error: string | null;
  serverNowMs: number;
  briefing: BriefingState;
};

export function useRealtimeProjection<T>(
  role: ViewerRole,
  roomCode: string | null,
) {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<RealtimeState<T>>({
    projection: null,
    connected: false,
    recovered: false,
    error: null,
    serverNowMs: Date.now(),
    briefing: { ...DEFAULT_BRIEFING_STATE },
  });

  useEffect(() => {
    if (!roomCode) return;
    setState((current) => ({
      ...current,
      projection: null,
      connected: false,
      recovered: false,
      error: null,
      briefing: { ...DEFAULT_BRIEFING_STATE },
    }));
    const socket = io({
      autoConnect: true,
      transports: ["polling", "websocket"],
      withCredentials: true,
      auth: { role, roomCode },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setState((current) => ({
        ...current,
        connected: true,
        recovered: socket.recovered,
        error: null,
      }));
      socket.emit(
        "viewer:subscribe",
        { role, roomCode },
        (result: { ok: boolean; error?: string }) => {
          if (!result.ok)
            setState((current) => ({
              ...current,
              error: result.error ?? "Could not subscribe",
            }));
        },
      );
    });
    socket.on("disconnect", () =>
      setState((current) => ({ ...current, connected: false })),
    );
    socket.on("connect_error", (error) =>
      setState((current) => ({
        ...current,
        connected: false,
        error: error.message,
      })),
    );
    socket.on("projection", (envelope: ProjectionEnvelope) => {
      if (
        (role === "public" && envelope.stream !== "public") ||
        (role === "player" && envelope.stream !== "private") ||
        (role === "host" && envelope.stream !== "host")
      )
        return;
      setState((current) => ({
        ...current,
        projection: envelope.payload as T,
        serverNowMs: envelope.serverNowMs,
        error: null,
      }));
    });
    socket.on("session:error", (payload: { message: string }) => {
      setState((current) => ({ ...current, error: payload.message }));
    });
    socket.on("briefing:state", (candidate: unknown) => {
      const parsed = BriefingStateSchema.safeParse(candidate);
      if (!parsed.success) return;
      setState((current) => ({ ...current, briefing: parsed.data }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, roomCode]);

  const sendCommand = useCallback(
    async (command: CommandEnvelope): Promise<CommandResult> => {
      const socket = socketRef.current;
      if (!socket?.connected) throw new Error("Field console is reconnecting");
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Command acknowledgement timed out")),
          3_000,
        );
        socket.emit("command", command, (result: CommandResult) => {
          window.clearTimeout(timeout);
          resolve(result);
        });
      });
    },
    [],
  );

  return { ...state, sendCommand, socket: socketRef.current };
}
