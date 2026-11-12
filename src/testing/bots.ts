import type { TelegramBotDefinition } from "../types";
import { BOT_TOKEN, SECOND_BOT_TOKEN } from "./constants";

/** Two independent bots, as a multi-bot deployment configures them. */
export const MULTI_BOTS: TelegramBotDefinition[] = [
  { key: "default", token: BOT_TOKEN, username: "test_bot" },
  { key: "ngo", token: SECOND_BOT_TOKEN, username: "ngo_bot" },
];

/** Copies the bots, optionally giving each the same OIDC app for fixtures. */
export function multiBots(oidc?: {
  clientId: string;
  clientSecret: string;
}): TelegramBotDefinition[] {
  return MULTI_BOTS.map((bot) => ({ ...bot, ...(oidc ? { oidc } : {}) }));
}
