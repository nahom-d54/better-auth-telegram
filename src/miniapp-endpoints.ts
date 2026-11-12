import {
  APIError,
  createAuthEndpoint,
  formCsrfMiddleware,
} from "better-auth/api";
import { ERROR_CODES } from "./constants";
import type { TelegramPluginConfig } from "./plugin-config";
import { findOrCreateTelegramUser, startSession } from "./telegram-account";
import {
  parseMiniAppInitData,
  validateMiniAppData,
  verifyMiniAppInitDataAny,
} from "./verify";

function readInitData(body: unknown): string {
  const initData = (body as { initData?: unknown } | undefined)?.initData;
  if (!initData || typeof initData !== "string") {
    throw APIError.from("BAD_REQUEST", ERROR_CODES.INIT_DATA_REQUIRED);
  }
  return initData;
}

/** Every configured bot token; HMAC data can come from any of them. */
function botTokens(config: TelegramPluginConfig): string[] {
  return config.bots.map((bot) => bot.token).filter(Boolean);
}

function requireBotTokens(config: TelegramPluginConfig): string[] {
  const tokens = botTokens(config);
  if (tokens.length === 0) {
    throw APIError.from(
      "INTERNAL_SERVER_ERROR",
      ERROR_CODES.BOT_TOKEN_REQUIRED
    );
  }
  return tokens;
}

/**
 * Creates the Mini App endpoints: signIn, validate.
 */
export function createMiniAppEndpoints(config: TelegramPluginConfig) {
  return {
    signInWithMiniApp: createAuthEndpoint(
      "/telegram/miniapp/signin",
      {
        method: "POST",
        // Login CSRF protection, as on /telegram/signin.
        use: [formCsrfMiddleware],
      },
      async (ctx) => {
        const initData = readInitData(ctx.body);

        if (
          config.miniAppValidateInitData &&
          !(await verifyMiniAppInitDataAny(
            initData,
            requireBotTokens(config),
            config.maxAuthAge
          ))
        ) {
          throw APIError.from(
            "UNAUTHORIZED",
            ERROR_CODES.INVALID_MINI_APP_INIT_DATA
          );
        }

        const data = parseMiniAppInitData(initData);
        if (!validateMiniAppData(data)) {
          throw APIError.from(
            "BAD_REQUEST",
            ERROR_CODES.INVALID_MINI_APP_DATA_STRUCTURE
          );
        }
        if (!data.user) {
          throw APIError.from("BAD_REQUEST", ERROR_CODES.NO_USER_IN_INIT_DATA);
        }

        const miniAppUser = data.user;
        const user = await findOrCreateTelegramUser(ctx, {
          identity: {
            telegramId: String(miniAppUser.id),
            username: miniAppUser.username,
          },
          userData: {
            name: miniAppUser.last_name
              ? `${miniAppUser.first_name} ${miniAppUser.last_name}`
              : miniAppUser.first_name,
            image: miniAppUser.photo_url,
            ...(await config.mapMiniAppDataToUser?.(miniAppUser)),
          },
          allowCreate: config.autoCreateUser && config.miniAppAllowAutoSignin,
          method: "telegram-mini-app",
          notFound: ERROR_CODES.MINI_APP_AUTO_SIGNIN_DISABLED,
        });

        return startSession(ctx, user);
      }
    ),

    validateMiniApp: createAuthEndpoint(
      "/telegram/miniapp/validate",
      {
        method: "POST",
      },
      async (ctx) => {
        const initData = readInitData(ctx.body);
        const matched = await verifyMiniAppInitDataAny(
          initData,
          requireBotTokens(config),
          config.maxAuthAge
        );

        if (!matched) {
          return ctx.json({
            valid: false,
            data: null,
          });
        }

        return ctx.json({
          valid: true,
          data: parseMiniAppInitData(initData),
          botId: matched.split(":")[0] || undefined,
        });
      }
    ),
  };
}

/**
 * Rate limit rules for Mini App endpoints.
 */
export function getMiniAppRateLimits() {
  return [
    {
      pathMatcher: (path: string) => path === "/telegram/miniapp/signin",
      window: 60,
      max: 10,
    },
    {
      pathMatcher: (path: string) => path === "/telegram/miniapp/validate",
      window: 60,
      max: 20,
    },
  ];
}
