import { APIError, createAuthEndpoint } from "better-auth/api";
import type { TelegramPluginConfig } from "./plugin-config";

/**
 * Creates the GET /telegram/config endpoint.
 * Always registered regardless of which flows are enabled.
 *
 * `?bot=<key>` selects a bot; without it the first bot is described.
 */
export function createConfigEndpoint(config: TelegramPluginConfig) {
  return {
    getTelegramConfig: createAuthEndpoint(
      "/telegram/config",
      {
        method: "GET",
      },
      (ctx) => {
        const key = typeof ctx.query?.bot === "string" ? ctx.query.bot : "";
        const bot = key
          ? config.bots.find((candidate) => candidate.key === key)
          : config.bots[0];
        if (!bot) {
          throw APIError.from("NOT_FOUND", {
            code: "BOT_NOT_FOUND",
            message: `Unknown Telegram bot "${key}"`,
          });
        }

        return ctx.json({
          botUsername: bot.username,
          loginWidgetEnabled: config.widgetEnabled,
          miniAppEnabled: config.miniAppEnabled,
          oidcEnabled: config.oidcEnabled,
          testMode: config.testMode,
          bots: config.bots.map((candidate) => ({
            key: candidate.key,
            username: candidate.username,
          })),
        });
      }
    ),
  };
}
