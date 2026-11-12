import { type ResolvedTelegramBot, resolveBots } from "./bot-config";
import { DEFAULT_MAX_AUTH_AGE } from "./constants";
import type { TelegramOIDCOptions, TelegramPluginOptions } from "./types";

/** `<bot id>:<secret>`, e.g. "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw". */
const BOT_TOKEN_SHAPE = /^\d+:[\w-]+$/u;

/**
 * Resolved configuration for the Telegram plugin.
 * Created from `TelegramPluginOptions` with all defaults applied.
 */
export interface TelegramPluginConfig {
  allowUserToLink: boolean;
  autoCreateUser: boolean;
  bots: ResolvedTelegramBot[];
  /** First bot token, kept for internal compatibility. */
  botToken: string;
  /** First bot username, kept for internal compatibility. */
  botUsername: string;
  mapMiniAppDataToUser?: NonNullable<
    TelegramPluginOptions["miniApp"]
  >["mapMiniAppDataToUser"];
  mapTelegramDataToUser?: TelegramPluginOptions["mapTelegramDataToUser"];
  maxAuthAge: number;
  miniAppAllowAutoSignin: boolean;
  miniAppEnabled: boolean;
  miniAppValidateInitData: boolean;
  oidc?: TelegramOIDCOptions;
  oidcEnabled: boolean;
  /** OIDC provider ids configured for this instance. */
  oidcProviderIds: string[];
  testMode: boolean;
  /** Configuration problems, logged by `init` through Better Auth's logger. */
  warnings: string[];
  widgetEnabled: boolean;
}

/**
 * Parses `TelegramPluginOptions`, applies defaults, and collects warnings
 * about missing or suspicious configuration (logged by the plugin's `init`
 * through Better Auth's logger). Structural mistakes such as duplicate bot
 * keys or provider ids throw a plain `Error`.
 */
export function createPluginConfig(
  options: TelegramPluginOptions
): TelegramPluginConfig {
  const {
    botToken,
    botUsername,
    allowUserToLink = true,
    autoCreateUser = true,
    loginWidget,
    maxAuthAge = DEFAULT_MAX_AUTH_AGE,
    mapTelegramDataToUser,
    miniApp,
    oidc,
    testMode = false,
  } = options;

  const widgetEnabled = loginWidget !== false;
  const miniAppEnabled = miniApp?.enabled ?? false;
  const oidcEnabled = oidc?.enabled ?? false;
  const identityColumns = widgetEnabled || miniAppEnabled;
  const warnings: string[] = [];
  const warn = (message: string) =>
    warnings.push(`[better-auth-telegram] ${message}`);

  const resolvedBotToken = (botToken ?? "").trim();
  if (resolvedBotToken !== (botToken ?? "")) {
    warn(
      "Removed whitespace around botToken. Telegram tokens contain none; check how the value is loaded (a trailing newline in an env file makes every signature check fail)."
    );
  }
  if (resolvedBotToken && !BOT_TOKEN_SHAPE.test(resolvedBotToken)) {
    warn(
      'botToken doesn\'t look like a bot token from @BotFather ("<bot id>:<secret>", e.g. "110201543:AAHdqTcv..."). Login Widget and Mini App signatures won\'t verify with it.'
    );
  }

  const resolvedBotUsername = (botUsername ?? "").replace(/^@/u, "");
  if (resolvedBotUsername !== (botUsername ?? "")) {
    warn(
      `botUsername "${botUsername}" starts with "@"; using "${resolvedBotUsername}". The Login Widget wants the bare username.`
    );
  }

  const hmacFlow =
    widgetEnabled || (miniAppEnabled && miniApp?.validateInitData !== false);

  const resolved = resolveBots(
    {
      botToken: resolvedBotToken,
      botUsername: resolvedBotUsername,
      bots: options.bots,
      hmacFlow,
      oidc,
      oidcEnabled,
      widgetEnabled,
    },
    warn
  );

  if (miniAppEnabled && miniApp?.validateInitData === false) {
    warn(
      "miniApp.validateInitData is false: Mini App sign-in accepts unsigned initData, so anyone can sign in as any Telegram user. Never use this in production."
    );
  }

  if (oidcEnabled && oidc?.requestPhone && !identityColumns) {
    warn(
      "OIDC: requestPhone is set, but with the Login Widget and Mini App off there is no telegramPhoneNumber column, so the phone number is not stored. Enable the Mini App (or the Login Widget) to get the Telegram columns, or read phone_number from mapOIDCProfileToUser into your own field."
    );
  }

  // Not in the types since 3.0; a 3.0 beta configuration may still set it.
  const { overrideUserInfoOnSignIn } = (oidc ?? {}) as {
    overrideUserInfoOnSignIn?: unknown;
  };
  if (overrideUserInfoOnSignIn) {
    warn(
      "OIDC: overrideUserInfoOnSignIn is not supported and is ignored (it would write the placeholder email over a real one). Use oidc.updateUserInfoOnSignIn to update returning users' profile without touching their email."
    );
  }

  if (testMode && oidcEnabled) {
    warn(
      "testMode is enabled with OIDC. Telegram's OIDC endpoint (oauth.telegram.org) has no documented test variant — OIDC authentication may not work with test server bot tokens."
    );
  }

  return {
    botToken: resolved.botToken,
    botUsername: resolved.botUsername,
    bots: resolved.bots,
    oidcProviderIds: resolved.oidcProviderIds,
    widgetEnabled,
    miniAppEnabled,
    oidcEnabled,
    testMode,
    allowUserToLink,
    autoCreateUser,
    maxAuthAge,
    miniAppValidateInitData: miniApp?.validateInitData ?? true,
    miniAppAllowAutoSignin: miniApp?.allowAutoSignin ?? true,
    mapTelegramDataToUser,
    mapMiniAppDataToUser: miniApp?.mapMiniAppDataToUser,
    oidc,
    warnings,
  };
}
