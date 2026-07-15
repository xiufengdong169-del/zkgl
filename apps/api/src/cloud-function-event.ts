import type { FunctionEvent } from "./handler.js";

export interface CloudContext {
  auth?: { uid?: string };
  requestId?: string;
}

export interface HttpLikeEvent extends FunctionEvent {
  body?: string | Record<string, unknown>;
  headers?: Record<string, string>;
}

function parseBody(rawBody: HttpLikeEvent["body"]): Partial<FunctionEvent> {
  if (typeof rawBody === "string") {
    try {
      return JSON.parse(rawBody) as Partial<FunctionEvent>;
    } catch {
      return {};
    }
  }
  if (rawBody && typeof rawBody === "object")
    return rawBody as Partial<FunctionEvent>;
  return {};
}

export function normalizeFunctionEvent(
  rawEvent: HttpLikeEvent,
  context: CloudContext = {},
): FunctionEvent {
  const body = parseBody(rawEvent.body);
  const event: FunctionEvent = { ...rawEvent, ...body };
  const requestId = event.requestId ?? context.requestId;
  const auth = event.auth?.uid ? event.auth : context.auth;
  return {
    ...event,
    ...(requestId ? { requestId } : {}),
    ...(auth ? { auth } : {}),
  };
}
