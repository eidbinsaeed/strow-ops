"use client";

/**
 * What a chart or table inside the chat can do besides showing itself: ask a
 * follow-up ("why is this number different?") and pin itself to Home.
 * Outside the chat (on Home) there is no provider, so those buttons hide.
 */
import { createContext, useContext } from "react";

export type ChatTools = { ask?: (q: string) => void; chatId?: string | null; canPin?: boolean };
const Ctx = createContext<ChatTools>({});
export const ChatToolsProvider = Ctx.Provider;
export const useChatTools = () => useContext(Ctx);
