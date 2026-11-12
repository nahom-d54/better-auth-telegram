import { ERROR_CODES, TELEGRAM_OIDC_PROVIDER_ID } from "./constants";
import type {
  TelegramBotDefinition,
  TelegramBotOIDCOptions,
  TelegramOIDCOptions,
} from "./types";

/** The bot that keeps the legacy `telegram-oidc` provider id. */
export const DEFAULT_BOT_KEY = "default";

/** One bot after defaults are applied. */
export interface ResolvedTelegramBot {
  key: string;
  oidc?: { clientId: string; clientSecret: string };
  oidcProviderId?: string;
  token: string;
  username: string;
}

export interface BotResolution {
  bots: ResolvedTelegramBot[];
  /** First bot token, kept for internal compatibility. */
  botToken: string;
  /** First bot username, kept for internal compatibility. */
  botUsername: string;
  oidcProviderIds: string[];
}

interface BotInput {
  /** A `bots[]` entry, as opposed to the legacy singular pair. */
  declared: boolean;
  key: string;
  oidc?: TelegramBotOIDCOptions;
  token: string;
  username: string;
}

interface ResolveBotOptions {
  bots: TelegramBotDefinition[] | undefined;
  botToken: string;
  botUsername: string;
  hmacFlow: boolean;
  oidc: TelegramOIDCOptions | undefined;
  oidcEnabled: boolean;
  widgetEnabled: boolean;
}

/** `<bot id>:<secret>`, e.g. "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw". */
const BOT_TOKEN_SHAPE = /^\d+:[\w-]+$/u;
const BOT_KEY_SHAPE = /^[a-z0-9-]+$/u;

function botId(token: string): string {
  return token.split(":")[0] ?? "";
}

function oidcProviderId(key: string, oidc: TelegramBotOIDCOptions) {
  // The default bot keeps the legacy id so existing OIDC accounts continue to
  // resolve; only additional bots can choose another provider id.
  if (key === DEFAULT_BOT_KEY) {
    return TELEGRAM_OIDC_PROVIDER_ID;
  }
  return oidc.providerId || `${TELEGRAM_OIDC_PROVIDER_ID}-${key}`;
}

function normalizeDeclaredBot(
  definition: TelegramBotDefinition,
  seenKeys: Set<string>,
  warn: (message: string) => void
): BotInput {
  const key = typeof definition.key === "string" ? definition.key : "";
  if (!BOT_KEY_SHAPE.test(key)) {
    throw new Error(
      `[better-auth-telegram] Invalid bot key ${JSON.stringify(key)}. Keys must match ^[a-z0-9-]+$ (lowercase letters, digits and hyphens).`
    );
  }
  if (seenKeys.has(key)) {
    throw new Error(
      `[better-auth-telegram] Duplicate bot key "${key}". Each bots[] entry needs a unique key.`
    );
  }
  seenKeys.add(key);

  const rawToken = typeof definition.token === "string" ? definition.token : "";
  const token = rawToken.trim();
  if (token !== rawToken) {
    warn(
      `Bot "${key}": removed whitespace around the token. Telegram tokens contain none; check how the value is loaded (a trailing newline in an env file makes every signature check fail).`
    );
  }
  if (token && !BOT_TOKEN_SHAPE.test(token)) {
    warn(
      `Bot "${key}": the token doesn't look like a bot token from @BotFather ("<bot id>:<secret>"). Login Widget and Mini App signatures won't verify with it.`
    );
  }

  const rawUsername = definition.username ?? "";
  const username = rawUsername.replace(/^@/u, "");
  if (username !== rawUsername) {
    warn(
      `Bot "${key}": username "${rawUsername}" starts with "@"; using "${username}". The Login Widget wants the bare username.`
    );
  }

  return {
    key,
    token,
    username,
    oidc: definition.oidc,
    declared: true,
  };
}

function resolveOIDC(
  bot: BotInput,
  options: ResolveBotOptions
): ResolvedTelegramBot {
  const global = options.oidc;
  const perBot = bot.oidc;
  // A bots[] bot gets OIDC only from its own entry. The default bot also
  // accepts the legacy global credentials, including when it was synthesized
  // from botToken/botUsername.
  const inherited =
    !perBot &&
    bot.key === DEFAULT_BOT_KEY &&
    (!options.bots || global?.clientId !== undefined || global?.clientSecret)
      ? {
          clientId: global?.clientId,
          clientSecret: global?.clientSecret,
        }
      : undefined;
  const configured = perBot ?? inherited;
  if (!(options.oidcEnabled && configured)) {
    return {
      key: bot.key,
      token: bot.token,
      username: bot.username,
    };
  }
  return {
    key: bot.key,
    token: bot.token,
    username: bot.username,
    oidcProviderId: oidcProviderId(bot.key, configured),
    oidc: {
      clientId: configured.clientId || botId(bot.token),
      clientSecret: configured.clientSecret ?? "",
    },
  };
}

function warnOIDCCredentials(
  bots: ResolvedTelegramBot[],
  legacy: boolean,
  warn: (message: string) => void
) {
  for (const bot of bots) {
    if (!(bot.oidcProviderId && bot.oidc)) {
      continue;
    }
    const prefix = legacy ? "" : `Bot "${bot.key}": `;
    if (!(bot.oidc.clientId || bot.token)) {
      warn(
        `${prefix}OIDC: clientId is required. Configure oidc.clientId or botToken before starting an OIDC login.`
      );
    }
    if (!bot.oidc.clientSecret) {
      warn(
        `${prefix}OIDC: clientSecret is required. Configure oidc.clientSecret (the Client Secret shown in @BotFather > your bot > Login Widget) before starting an OIDC login.`
      );
    }
  }
}

function warnSharedWidgetAndOIDC(
  bots: ResolvedTelegramBot[],
  legacy: boolean,
  warn: (message: string) => void
) {
  for (const bot of bots) {
    if (
      bot.oidc?.clientId &&
      bot.token &&
      bot.oidc.clientId !== botId(bot.token)
    ) {
      continue;
    }
    if (!bot.oidcProviderId) {
      continue;
    }
    const prefix = legacy ? "" : `Bot "${bot.key}": `;
    warn(
      `${prefix}Login Widget and OIDC are both enabled on the same bot. Switching a bot to OpenID Connect in @BotFather permanently disables its legacy Login Widget; use a second bot for OIDC or set loginWidget: false.`
    );
  }
}

/**
 * Normalizes `bots[]` and the legacy `botToken`/`botUsername` pair, applies
 * OIDC defaults and verifies that bot keys and provider ids are unique.
 *
 * Structural mistakes (invalid or duplicate keys, duplicate provider ids)
 * throw a plain `Error`; suspicious values only warn, as before.
 */
export function resolveBots(
  options: ResolveBotOptions,
  warn: (message: string) => void
): BotResolution {
  const declared = Array.isArray(options.bots);
  const seenKeys = new Set<string>();
  const inputs = declared
    ? options.bots!.map((bot) => normalizeDeclaredBot(bot, seenKeys, warn))
    : [
        {
          key: DEFAULT_BOT_KEY,
          token: options.botToken,
          username: options.botUsername,
          declared: false,
        },
      ];

  // The legacy singular pair supplies the default bot when bots[] omits it.
  if (
    declared &&
    !seenKeys.has(DEFAULT_BOT_KEY) &&
    (options.botToken || options.botUsername || inputs.length === 0)
  ) {
    inputs.unshift({
      key: DEFAULT_BOT_KEY,
      token: options.botToken,
      username: options.botUsername,
      declared: false,
    });
  }
  if (inputs.length === 0) {
    inputs.push({
      key: DEFAULT_BOT_KEY,
      token: "",
      username: "",
      declared: false,
    });
  }

  const tokens = new Map<string, string>();
  for (const bot of inputs) {
    if (!bot.token) {
      continue;
    }
    const other = tokens.get(bot.token);
    if (other) {
      warn(
        `Bot keys "${other}" and "${bot.key}" use the same token. Only use one token for several bots if they really are the same Telegram bot.`
      );
    } else {
      tokens.set(bot.token, bot.key);
    }
  }

  if (declared) {
    for (const bot of inputs) {
      if (options.hmacFlow && !bot.token) {
        warn(
          `Bot "${bot.key}": ${ERROR_CODES.BOT_TOKEN_REQUIRED.message}. The enabled HMAC flow will reject its requests until it is configured.`
        );
      }
      if (options.widgetEnabled && !bot.username) {
        warn(
          `Bot "${bot.key}": ${ERROR_CODES.BOT_USERNAME_REQUIRED.message}. Its Login Widget cannot be rendered until it is configured.`
        );
      }
    }
  } else {
    const [bot] = inputs;
    if (options.hmacFlow && !bot?.token) {
      warn(
        `${ERROR_CODES.BOT_TOKEN_REQUIRED.message}. The enabled HMAC flow will reject requests until it is configured.`
      );
    }
    if (options.widgetEnabled && !bot?.username) {
      warn(
        `${ERROR_CODES.BOT_USERNAME_REQUIRED.message}. The Login Widget cannot be rendered until it is configured.`
      );
    }
  }

  const bots = inputs.map((bot) => resolveOIDC(bot, options));
  warnOIDCCredentials(bots, !declared, warn);
  if (options.widgetEnabled && options.oidcEnabled) {
    warnSharedWidgetAndOIDC(bots, !declared, warn);
  }

  const providerIds = bots.flatMap((bot) =>
    bot.oidcProviderId ? [bot.oidcProviderId] : []
  );
  const duplicate = providerIds.find(
    (providerId, index) => providerIds.indexOf(providerId) !== index
  );
  if (duplicate) {
    throw new Error(
      `[better-auth-telegram] Duplicate OIDC provider id "${duplicate}". Set bots[].oidc.providerId to a unique value.`
    );
  }

  return {
    bots,
    botToken: bots[0]?.token ?? "",
    botUsername: bots[0]?.username ?? "",
    oidcProviderIds: providerIds,
  };
}
