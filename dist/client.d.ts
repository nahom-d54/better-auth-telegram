import { o as TelegramAuthData, r as TELEGRAM_ERROR_CODES, t as telegram } from "./index-nwPljZIM.js";
import { BetterFetch, ClientStore } from "better-auth/client";
import { Session, User } from "better-auth/types";
/**
 * Options for initializing Telegram Login Widget
 */
interface TelegramWidgetOptions {
  /**
   * Bot key to render, as listed by `GET /telegram/config`. Defaults to the
   * first bot.
   */
  bot?: string;
  /**
   * Corner radius of the button
   * @default 20
   */
  cornerRadius?: number;
  /**
   * Language code (e.g., "en", "pl")
   */
  lang?: string;
  /**
   * Request write access permission
   * @default false
   */
  requestAccess?: boolean;
  /**
   * Whether to show user photo
   * @default true
   */
  showUserPhoto?: boolean;
  /**
   * Size of the login button
   * @default "large"
   */
  size?: "large" | "medium" | "small";
}
/** A rendered Login Widget. */
interface TelegramWidget {
  /**
   * Removes the widget: its script, the iframe Telegram rendered for it and
   * (for `initTelegramWidget`) its global callback. Call it from an effect
   * cleanup. A widget rendered later into the same container is unaffected.
   */
  destroy: () => void;
}
/**
 * Options that can be passed to fetch calls for customization
 * (e.g., custom headers, cache control, credentials)
 */
type FetchOptions = Record<string, any>;
/**
 * `error` of every action: Better Auth's error body. `code` is one of
 * `TELEGRAM_ERROR_CODES` or a Better Auth code (`SESSION_NOT_FRESH`, ...).
 */
interface TelegramClientError {
  code?: string;
  message?: string;
}
/** The user as the Telegram endpoints return it. */
type TelegramUser = User & {
  telegramId?: string | null;
  telegramPhoneNumber?: string | null;
  telegramUsername?: string | null;
};
/** Response of `/telegram/signin` and `/telegram/miniapp/signin`. */
interface TelegramSignInResponse {
  session: Session;
  user: TelegramUser;
}
/** Response of `/telegram/link` and `/telegram/unlink`. */
interface TelegramLinkResponse {
  message: string;
  success: boolean;
}
interface TelegramConfigResponse {
  bots: {
    key: string;
    username: string;
  }[];
  botUsername: string;
  loginWidgetEnabled: boolean;
  miniAppEnabled: boolean;
  oidcEnabled: boolean;
  testMode: boolean;
}
/** Response of `/telegram/miniapp/validate`. */
interface TelegramMiniAppValidationResponse {
  /** Numeric bot id whose token signed the initData, when valid. */
  botId?: string;
  data: any;
  valid: boolean;
}
type TelegramPlugin = typeof telegram;
/**
 * Client plugin for Telegram authentication
 */
export declare const telegramClient: () => {
  id: "telegram";
  $InferServerPlugin: ReturnType<TelegramPlugin>;
  $ERROR_CODES: {
    ACCOUNT_CREATION_REJECTED: import("better-auth").RawError<"ACCOUNT_CREATION_REJECTED">;
    ACCOUNT_NOT_LINKED: import("better-auth").RawError<"ACCOUNT_NOT_LINKED">;
    ACCOUNT_UNLINK_REJECTED: import("better-auth").RawError<"ACCOUNT_UNLINK_REJECTED">;
    BOT_TOKEN_REQUIRED: import("better-auth").RawError<"BOT_TOKEN_REQUIRED">;
    BOT_USERNAME_REQUIRED: import("better-auth").RawError<"BOT_USERNAME_REQUIRED">;
    CANNOT_UNLINK_LAST_ACCOUNT: import("better-auth").RawError<"CANNOT_UNLINK_LAST_ACCOUNT">;
    DIFFERENT_TELEGRAM_ACCOUNT_LINKED: import("better-auth").RawError<"DIFFERENT_TELEGRAM_ACCOUNT_LINKED">;
    IDENTITY_UPDATE_REJECTED: import("better-auth").RawError<"IDENTITY_UPDATE_REJECTED">;
    INIT_DATA_REQUIRED: import("better-auth").RawError<"INIT_DATA_REQUIRED">;
    INVALID_AUTHENTICATION: import("better-auth").RawError<"INVALID_AUTHENTICATION">;
    INVALID_AUTH_DATA: import("better-auth").RawError<"INVALID_AUTH_DATA">;
    INVALID_MINI_APP_DATA_STRUCTURE: import("better-auth").RawError<"INVALID_MINI_APP_DATA_STRUCTURE">;
    INVALID_MINI_APP_INIT_DATA: import("better-auth").RawError<"INVALID_MINI_APP_INIT_DATA">;
    LINKING_DISABLED: import("better-auth").RawError<"LINKING_DISABLED">;
    MINI_APP_AUTO_SIGNIN_DISABLED: import("better-auth").RawError<"MINI_APP_AUTO_SIGNIN_DISABLED">;
    NOT_AUTHENTICATED: import("better-auth").RawError<"NOT_AUTHENTICATED">;
    NOT_LINKED: import("better-auth").RawError<"NOT_LINKED">;
    NO_USER_IN_INIT_DATA: import("better-auth").RawError<"NO_USER_IN_INIT_DATA">;
    OIDC_CLIENT_ID_REQUIRED: import("better-auth").RawError<"OIDC_CLIENT_ID_REQUIRED">;
    OIDC_CLIENT_SECRET_REQUIRED: import("better-auth").RawError<"OIDC_CLIENT_SECRET_REQUIRED">;
    ORPHANED_ACCOUNT: import("better-auth").RawError<"ORPHANED_ACCOUNT">;
    PLACEHOLDER_EMAIL_RESERVED: import("better-auth").RawError<"PLACEHOLDER_EMAIL_RESERVED">;
    TELEGRAM_ALREADY_LINKED_OTHER: import("better-auth").RawError<"TELEGRAM_ALREADY_LINKED_OTHER">;
    TELEGRAM_ALREADY_LINKED_SELF: import("better-auth").RawError<"TELEGRAM_ALREADY_LINKED_SELF">;
    USER_CREATION_DISABLED: import("better-auth").RawError<"USER_CREATION_DISABLED">;
    USER_CREATION_REJECTED: import("better-auth").RawError<"USER_CREATION_REJECTED">;
  };
  pathMethods: {
    "/telegram/unlink": "POST";
  };
  atomListeners: {
    matcher: (path: string) => boolean;
    signal: "$sessionSignal";
  }[];
  getActions: ($fetch: BetterFetch, $store: ClientStore) => {
    initTelegramWidget: (container: string | HTMLElement, options: TelegramWidgetOptions | undefined, onAuth: (authData: TelegramAuthData) => void | Promise<void>) => Promise<TelegramWidget>;
    initTelegramWidgetRedirect: (container: string | HTMLElement, redirectUrl: string, options?: TelegramWidgetOptions) => Promise<TelegramWidget>;
    /**
     * Sign in with Telegram
     * @param authData - Authentication data from Telegram Login Widget
     * @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
     */
    signInWithTelegram: (authData: TelegramAuthData, fetchOptions?: FetchOptions) => Promise<{
      data: TelegramSignInResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Link current user account with Telegram
     * @param authData - Authentication data from Telegram Login Widget
     * @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
     */
    linkTelegram: (authData: TelegramAuthData, fetchOptions?: FetchOptions) => Promise<{
      data: TelegramLinkResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Unlink Telegram account from current user
     * @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
     */
    unlinkTelegram: (fetchOptions?: FetchOptions) => Promise<{
      data: TelegramLinkResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Get Telegram bot configuration
     * @param options - Optional bot key and fetch options (e.g., headers)
     */
    getTelegramConfig: (options?: FetchOptions & {
      bot?: string;
    }) => Promise<{
      data: TelegramConfigResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Sign in with Telegram Mini App
     * @param initData - Raw initData string from Telegram.WebApp.initData
     *
     * @example
     * ```ts
     * // Inside a Telegram Mini App
     * const initData = window.Telegram.WebApp.initData;
     * const result = await signInWithMiniApp(initData);
     * console.log("Signed in:", result);
     * ```
     */
    signInWithMiniApp: (initData: string, fetchOptions?: FetchOptions) => Promise<{
      data: TelegramSignInResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Validate Telegram Mini App initData
     * @param initData - Raw initData string from Telegram.WebApp.initData
     * @returns Object with valid status and parsed data if valid
     *
     * @example
     * ```ts
     * const initData = window.Telegram.WebApp.initData;
     * const result = await validateMiniApp(initData);
     * if (result.data?.valid) {
     *   console.log("User:", result.data.data?.user);
     * }
     * ```
     */
    validateMiniApp: (initData: string, fetchOptions?: FetchOptions) => Promise<{
      data: TelegramMiniAppValidationResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Auto sign-in from Telegram Mini App
     * Automatically retrieves initData from Telegram.WebApp and signs in
     * Only works when running inside a Telegram Mini App
     *
     * @example
     * ```ts
     * // Auto-signin when Mini App launches
     * try {
     *   const result = await autoSignInFromMiniApp();
     *   console.log("Auto signed in:", result);
     * } catch (error) {
     *   console.error("Not running in Mini App or auth failed");
     * }
     * ```
     */
    autoSignInFromMiniApp: (fetchOptions?: FetchOptions) => Promise<{
      data: TelegramSignInResponse;
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
    /**
     * Sign in with Telegram OIDC (OpenID Connect)
     * Initiates the standard OAuth 2.0 Authorization Code flow with PKCE
     * via oauth.telegram.org. Requires `oidc.enabled: true` on the server.
     *
     * @param options - Callback URLs, an optional bot key or provider id
     * @param fetchOptions - Optional fetch options
     *
     * @example
     * ```ts
     * await authClient.signInWithTelegramOIDC({
     *   callbackURL: "/dashboard",
     *   bot: "ngo",
     * });
     * ```
     */
    signInWithTelegramOIDC: (options?: {
      bot?: string;
      callbackURL?: string;
      errorCallbackURL?: string;
      providerId?: string;
    }, fetchOptions?: FetchOptions) => Promise<{
      data: {
        url: string;
        redirect: boolean;
      };
      error: null;
    } | {
      data: null;
      error: {
        status: number;
        statusText: string;
        code?: string;
        message?: string;
      };
    }>;
  };
};
export { TELEGRAM_ERROR_CODES, type TelegramClientError, type TelegramLinkResponse, type TelegramMiniAppValidationResponse, type TelegramSignInResponse, type TelegramUser, type TelegramWidget, type TelegramWidgetOptions, telegramClient as default };
//# sourceMappingURL=client.d.ts.map