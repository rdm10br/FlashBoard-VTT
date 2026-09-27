import type { WebSocket } from "ws";
import type { ClientState } from "../clientRegistry.js";

export type HandlerContext = { state: ClientState; ws: WebSocket };
export type MessageHandler = (payload: any, ctx: HandlerContext) => void | Promise<void>;