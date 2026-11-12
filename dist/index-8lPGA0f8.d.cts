import "@better-auth/core";
import { User } from "better-auth";
import { OAuthProvider } from "@better-auth/core/oauth2";
/**
 * Data returned by Telegram Login Widget
 */
interface TelegramAuthData {
  auth_date: number;
  first_name: string;
  hash: string;
  id: number;
  last_name?: string;
  photo_url?: string;
  username?: string;
}
/**
 * User object from Telegram Mini Apps
 */
interface TelegramMiniAppUser {
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  first_name: string;
  id: number;
  is_bot?: boolean;
  is_premium?: boolean;
  language_code?: string;
  last_name?: string;
  photo_url?: string;
  username?: string;
}
/**
 * Chat object from Telegram Mini Apps
 */
interface TelegramMiniAppChat {
  id: number;
  photo_url?: string;
  title?: string;
  type: string;
  username?: string;
}
/**
 * Complete data from Telegram Mini Apps initData
 */
interface TelegramMiniAppData {
  auth_date: number;
  can_send_after?: number;
  chat?: TelegramMiniAppChat;
  chat_instance?: string;
  /** Present when the Mini App was opened from a chat join request. */
  chat_join_request_query_id?: string;
  chat_type?: "sender" | "private" | "group" | "supergroup" | "channel";
  hash: string;
  query_id?: string;
  receiver?: TelegramMiniAppUser;
  /**
   * Ed25519 signature for third-party validation without the bot token.
   * Part of the signed data, so the HMAC `hash` check covers it as well.
   */
  signature?: string;
  start_param?: string;
  user?: TelegramMiniAppUser;
}
/**
 * JWT ID token claims from Telegram OIDC.
 *
 * Profile claims (`id`, names, `picture`, `preferred_username`) need the
 * `profile` scope, and Telegram omits them for bots that sign ID tokens with
 * EdDSA or ES256K.
 */
interface TelegramOIDCClaims {
  /** Verified audience, normalized to the configured client ID. */
  aud: string;
  exp: number;
  family_name?: string;
  given_name?: string;
  iat: number;
  /**
   * Telegram user id, the same number the Login Widget and Mini Apps report.
   * Numeric ID token values are normalized to a string (e.g. `"8306595751"`)
   * before the profile is passed to the mapper.
   */
  id?: string;
  iss: string;
  name?: string;
  nonce?: string;
  /** Digits only, without a leading `+` (requires the `phone` scope). */
  phone_number?: string;
  phone_number_verified?: boolean;
  picture?: string;
  preferred_username?: string;
  /**
   * Subject: a user identifier scoped to one bot — the same Telegram user
   * gets a different `sub` from each bot. Not the Telegram user id.
   */
  sub: string;
}
/**
 * User fields returned by a user mapper (`mapTelegramDataToUser`,
 * `mapMiniAppDataToUser`, `mapOIDCProfileToUser`): the profile plus any
 * `user.additionalFields`. A mapper may return it in a Promise.
 */
interface TelegramMappedUser {
  email?: string;
  image?: string;
  name?: string;
  [key: string]: any;
}
/**
 * Configuration options for Telegram OIDC authentication
 */
interface TelegramOIDCOptions {
  /**
   * Client ID shown in @BotFather (your bot > Login Widget) — the bot's id.
   * If omitted, the id part of `botToken` is used.
   *
   * Switching a bot to OpenID Connect permanently disables its legacy Login
   * Widget, so a deployment that also serves the Login Widget needs a second
   * bot for OIDC: set this to that bot's id.
   */
  clientId?: string;
  /**
   * Client Secret shown in @BotFather (your bot > Login Widget) after
   * switching the bot to OpenID Connect. This is NOT the bot token.
   * Required; OIDC logins fail until it is set.
   */
  clientSecret?: string;
  /**
   * Don't request the default `profile` scope (`openid` is always sent).
   * Without it the ID token has no `id`, name or username, so the Telegram
   * id is not copied onto the user.
   * @default false
   */
  disableDefaultScope?: boolean;
  /**
   * Reject client-submitted ID tokens (`POST /sign-in/social` or
   * `/link-social` with `idToken`), leaving only the redirect flow.
   * @default false
   */
  disableIdTokenSignIn?: boolean;
  /**
   * Only sign in existing users; never create a user from Telegram OIDC.
   * @default false
   */
  disableSignUp?: boolean;
  /**
   * Enable Telegram OIDC support
   * @default false
   */
  enabled?: boolean;
  /**
   * Maps the verified ID token claims to the user Better Auth creates (and,
   * with `updateUserInfoOnSignIn`, updates). May be async, like Better Auth's
   * `mapProfileToUser`; throw an `APIError` to refuse the sign-in. `id` and
   * `emailVerified` are ignored.
   */
  mapOIDCProfileToUser?: (claims: TelegramOIDCClaims) => TelegramMappedUser | Promise<TelegramMappedUser>;
  /**
   * Request bot access (adds "telegram:bot_access" scope)
   * @default false
   */
  requestBotAccess?: boolean;
  /**
   * Request phone number (adds "phone" scope)
   * @default false
   */
  requestPhone?: boolean;
  /**
   * Scopes to request on top of the defaults (`openid`, `profile`), as with
   * Better Auth's built-in providers.
   */
  scopes?: string[];
  /**
   * Write the profile (`name`, `image` and the fields returned by
   * `mapOIDCProfileToUser`) onto returning users on every OIDC sign-in, not
   * just when the user is created. The email and its verification are never
   * changed, unlike Better Auth's `overrideUserInfoOnSignIn`, which would
   * put the placeholder email back over a real one.
   * @default false
   */
  updateUserInfoOnSignIn?: boolean;
}
/**
 * OIDC credentials for one bot. Each bot has its own OIDC app in @BotFather.
 */
interface TelegramBotOIDCOptions {
  /**
   * Client ID of this bot's OIDC app. Defaults to the bot id part of `token`.
   */
  clientId?: string;
  /**
   * Client Secret shown in @BotFather after switching this bot to OpenID
   * Connect. This is NOT the bot token.
   */
  clientSecret?: string;
  /**
   * Social provider id. Defaults to `telegram-oidc` for the `default` bot and
   * `telegram-oidc-<key>` for every other bot.
   */
  providerId?: string;
}
/**
 * One Telegram bot served by the plugin.
 */
interface TelegramBotDefinition {
  /**
   * Unique bot key, matching `^[a-z0-9-]+$`. The key identifies the bot in
   * `GET /telegram/config?bot=<key>` and in the client helpers.
   */
  key: string;
  /**
   * OIDC configuration for this bot. Omit it to serve only the HMAC flows for
   * this bot.
   */
  oidc?: TelegramBotOIDCOptions;
  /**
   * Bot token obtained from @BotFather, used to verify Login Widget and Mini
   * App signatures.
   */
  token: string;
  /**
   * Bot username (without @), used to render the Login Widget.
   */
  username?: string;
}
/**
 * Configuration options for the Telegram plugin
 */
interface TelegramPluginOptions {
  /**
   * Allow users to link their Telegram account to existing account
   * @default true
   */
  allowUserToLink?: boolean;
  /**
   * Automatically create user if doesn't exist
   * @default true
   */
  autoCreateUser?: boolean;
  /**
   * Multiple Telegram bots served by one Better Auth instance. The first bot
   * (or the `default` entry) keeps using `telegram-oidc` as its OIDC provider
   * id; additional bots use `telegram-oidc-<key>`.
   */
  bots?: TelegramBotDefinition[];
  /**
   * Bot token obtained from @BotFather
   * Used for verifying authentication data
   *
   * Kept for backward compatibility. When `bots` is set, this is the
   * `default` bot if that list does not contain one.
   */
  botToken?: string;
  /**
   * Bot username (without @)
   * Used for generating the login widget
   *
   * Kept for backward compatibility. When `bots` is set, this is the
   * `default` bot if that list does not contain one.
   */
  botUsername?: string;
  /**
   * Enable Login Widget endpoints (signin, link, unlink).
   * When false, Widget endpoints are not registered and Telegram-specific
   * user/account schema fields are omitted (unless Mini App is enabled).
   * @default true
   */
  loginWidget?: boolean;
  /**
   * Maps the verified Login Widget data to the user the plugin creates. May
   * be async; throw an `APIError` to refuse the sign-in. `id` and
   * `emailVerified` are ignored.
   */
  mapTelegramDataToUser?: (data: TelegramAuthData) => TelegramMappedUser | Promise<TelegramMappedUser>;
  /**
   * Maximum age of auth_date in seconds
   * Prevents replay attacks
   * @default 86400 (24 hours)
   */
  maxAuthAge?: number;
  /**
   * Telegram Mini Apps configuration
   */
  miniApp?: {
    /**
     * Enable Telegram Mini Apps support
     * @default false
     */
    enabled?: boolean;
    /**
     * Verify the initData signature before signing users in.
     * Turning this off lets anyone sign in as any Telegram user; only do it
     * in tests.
     * @default true
     */
    validateInitData?: boolean;
    /**
     * Allow automatic sign-in from Mini Apps
     * @default true
     */
    allowAutoSignin?: boolean;
    /**
     * Maps the verified Mini App user to the user the plugin creates. May be
     * async; throw an `APIError` to refuse the sign-in. `id` and
     * `emailVerified` are ignored.
     */
    mapMiniAppDataToUser?: (data: TelegramMiniAppUser) => TelegramMappedUser | Promise<TelegramMappedUser>;
  };
  /**
   * Telegram OIDC (OpenID Connect) configuration
   * Uses standard OAuth 2.0 Authorization Code flow with PKCE
   * via oauth.telegram.org
   */
  oidc?: TelegramOIDCOptions;
  /**
   * Marks a deployment that uses a bot from Telegram's test environment.
   * Purely informational: it is returned by `GET /telegram/config` so the
   * client can tell, and verification is unchanged (HMAC only depends on the
   * bot token). Telegram documents no test variant of the Login Widget or of
   * OIDC (oauth.telegram.org); a warning is logged if OIDC is enabled.
   * @default false
   */
  testMode?: boolean;
}
/**
 * Account record as returned by the Better Auth adapter
 */
interface TelegramAccountRecord {
  accountId: string;
  id: string;
  providerId: string;
  telegramId?: string;
  telegramUsername?: string;
  userId: string;
}
//#region src/standard-schema.d.ts
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Validates unknown input values. */
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** The non-existent issues. */
    readonly issues?: undefined;
  }
  /** The result interface if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard Schema types interface. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Schema. */
  type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  /** Infers the output type of a Standard Schema. */
  type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
declare const statusCodes: {
  OK: number;
  CREATED: number;
  ACCEPTED: number;
  NO_CONTENT: number;
  MULTIPLE_CHOICES: number;
  MOVED_PERMANENTLY: number;
  FOUND: number;
  SEE_OTHER: number;
  NOT_MODIFIED: number;
  TEMPORARY_REDIRECT: number;
  BAD_REQUEST: number;
  UNAUTHORIZED: number;
  PAYMENT_REQUIRED: number;
  FORBIDDEN: number;
  NOT_FOUND: number;
  METHOD_NOT_ALLOWED: number;
  NOT_ACCEPTABLE: number;
  PROXY_AUTHENTICATION_REQUIRED: number;
  REQUEST_TIMEOUT: number;
  CONFLICT: number;
  GONE: number;
  LENGTH_REQUIRED: number;
  PRECONDITION_FAILED: number;
  PAYLOAD_TOO_LARGE: number;
  URI_TOO_LONG: number;
  UNSUPPORTED_MEDIA_TYPE: number;
  RANGE_NOT_SATISFIABLE: number;
  EXPECTATION_FAILED: number;
  "I'M_A_TEAPOT": number;
  MISDIRECTED_REQUEST: number;
  UNPROCESSABLE_ENTITY: number;
  LOCKED: number;
  FAILED_DEPENDENCY: number;
  TOO_EARLY: number;
  UPGRADE_REQUIRED: number;
  PRECONDITION_REQUIRED: number;
  TOO_MANY_REQUESTS: number;
  REQUEST_HEADER_FIELDS_TOO_LARGE: number;
  UNAVAILABLE_FOR_LEGAL_REASONS: number;
  INTERNAL_SERVER_ERROR: number;
  NOT_IMPLEMENTED: number;
  BAD_GATEWAY: number;
  SERVICE_UNAVAILABLE: number;
  GATEWAY_TIMEOUT: number;
  HTTP_VERSION_NOT_SUPPORTED: number;
  VARIANT_ALSO_NEGOTIATES: number;
  INSUFFICIENT_STORAGE: number;
  LOOP_DETECTED: number;
  NOT_EXTENDED: number;
  NETWORK_AUTHENTICATION_REQUIRED: number;
};
type Status = 100 | 101 | 102 | 103 | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226 | 300 | 301 | 302 | 303 | 304 | 305 | 306 | 307 | 308 | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418 | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451 | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511;
declare class InternalAPIError extends Error {
  status: keyof typeof statusCodes | Status;
  body: ({
    message?: string;
    code?: string;
    cause?: unknown;
  } & Record<string, any>) | undefined;
  headers: HeadersInit;
  statusCode: number;
  constructor(status?: keyof typeof statusCodes | Status, body?: ({
    message?: string;
    code?: string;
    cause?: unknown;
  } & Record<string, any>) | undefined, headers?: HeadersInit, statusCode?: number);
}
type APIError = InstanceType<typeof InternalAPIError>;
declare const APIError: new (status?: Status | "OK" | "CREATED" | "ACCEPTED" | "NO_CONTENT" | "MULTIPLE_CHOICES" | "MOVED_PERMANENTLY" | "FOUND" | "SEE_OTHER" | "NOT_MODIFIED" | "TEMPORARY_REDIRECT" | "BAD_REQUEST" | "UNAUTHORIZED" | "PAYMENT_REQUIRED" | "FORBIDDEN" | "NOT_FOUND" | "METHOD_NOT_ALLOWED" | "NOT_ACCEPTABLE" | "PROXY_AUTHENTICATION_REQUIRED" | "REQUEST_TIMEOUT" | "CONFLICT" | "GONE" | "LENGTH_REQUIRED" | "PRECONDITION_FAILED" | "PAYLOAD_TOO_LARGE" | "URI_TOO_LONG" | "UNSUPPORTED_MEDIA_TYPE" | "RANGE_NOT_SATISFIABLE" | "EXPECTATION_FAILED" | "I'M_A_TEAPOT" | "MISDIRECTED_REQUEST" | "UNPROCESSABLE_ENTITY" | "LOCKED" | "FAILED_DEPENDENCY" | "TOO_EARLY" | "UPGRADE_REQUIRED" | "PRECONDITION_REQUIRED" | "TOO_MANY_REQUESTS" | "REQUEST_HEADER_FIELDS_TOO_LARGE" | "UNAVAILABLE_FOR_LEGAL_REASONS" | "INTERNAL_SERVER_ERROR" | "NOT_IMPLEMENTED" | "BAD_GATEWAY" | "SERVICE_UNAVAILABLE" | "GATEWAY_TIMEOUT" | "HTTP_VERSION_NOT_SUPPORTED" | "VARIANT_ALSO_NEGOTIATES" | "INSUFFICIENT_STORAGE" | "LOOP_DETECTED" | "NOT_EXTENDED" | "NETWORK_AUTHENTICATION_REQUIRED" | undefined, body?: ({
  message?: string;
  code?: string;
  cause?: unknown;
} & Record<string, any>) | undefined, headers?: HeadersInit | undefined, statusCode?: number | undefined) => InternalAPIError & {
  errorStack: string | undefined;
};
type Prettify<T> = { [K in keyof T]: T[K]; } & {};
type IsEmptyObject<T> = keyof T extends never ? true : false;
//#region src/openapi.d.ts
type OpenAPISchemaType = "string" | "number" | "integer" | "boolean" | "array" | "object";
interface OpenAPIParameter {
  in: "query" | "path" | "header" | "cookie";
  name?: string | undefined;
  description?: string | undefined;
  required?: boolean | undefined;
  schema?: {
    type: OpenAPISchemaType;
    format?: string | undefined;
    items?: {
      type: OpenAPISchemaType;
    } | undefined;
    enum?: string[] | undefined;
    minLength?: number | undefined;
    description?: string | undefined;
    default?: string | undefined;
    example?: string | undefined;
  } | undefined;
}
//#region src/endpoint.d.ts
interface EndpointBaseOptions {
  /**
   * Query Schema
   */
  query?: StandardSchemaV1;
  /**
   * Error Schema
   */
  error?: StandardSchemaV1;
  /**
   * If true headers will be required to be passed in the context
   */
  requireHeaders?: boolean;
  /**
   * If true request object will be required
   */
  requireRequest?: boolean;
  /**
   * Clone the request object from the router
   */
  cloneRequest?: boolean;
  /**
   * If true the body will be undefined
   */
  disableBody?: boolean;
  /**
   * Endpoint metadata
   */
  metadata?: {
    /**
     * Open API definition
     */
    openapi?: {
      summary?: string | undefined;
      description?: string | undefined;
      tags?: string[] | undefined;
      operationId?: string | undefined;
      parameters?: OpenAPIParameter[] | undefined;
      requestBody?: {
        content: {
          "application/json": {
            schema: {
              type?: OpenAPISchemaType | undefined;
              properties?: Record<string, any> | undefined;
              required?: string[] | undefined;
              $ref?: string | undefined;
            };
          };
        };
      } | undefined;
      responses?: {
        [status: string]: {
          description: string;
          content?: {
            "application/json"?: {
              schema: {
                type?: OpenAPISchemaType | undefined;
                properties?: Record<string, any> | undefined;
                required?: string[] | undefined;
                $ref?: string | undefined;
              };
            } | undefined;
            "text/plain"?: {
              schema?: {
                type?: OpenAPISchemaType | undefined;
                properties?: Record<string, any> | undefined;
                required?: string[] | undefined;
                $ref?: string | undefined;
              } | undefined;
            } | undefined;
            "text/html"?: {
              schema?: {
                type?: OpenAPISchemaType | undefined;
                properties?: Record<string, any> | undefined;
                required?: string[] | undefined;
                $ref?: string | undefined;
              } | undefined;
            } | undefined;
          } | undefined;
        };
      } | undefined;
    } | undefined;
    /**
     * Infer body and query type from ts interface
     *
     * useful for generic and dynamic types
     *
     * @example
     * ```ts
     * const endpoint = createEndpoint("/path", {
     * 		method: "POST",
     * 		body: z.record(z.string()),
     * 		$Infer: {
     * 			body: {} as {
     * 				type: InferTypeFromOptions<Option> // custom type inference
     * 			}
     * 		}
     * 	}, async(ctx)=>{
     * 		const body = ctx.body
     * 	})
     * ```
     */
    $Infer?: {
      /**
       * Body
       */
      body?: any;
      /**
       * Query
       */
      query?: Record<string, any>;
    };
    /**
     * If enabled, endpoint won't be exposed over a router
     * @deprecated Use path-less endpoints instead
     */
    SERVER_ONLY?: boolean;
    /**
     * If enabled, endpoint won't be exposed as an action to the client
     * @deprecated Use path-less endpoints instead
     */
    isAction?: boolean;
    /**
     * Defines the places where the endpoint will be available
     *
     * Possible options:
     * - `rpc` - the endpoint is exposed to the router, can be invoked directly and is available to the client
     * - `server` - the endpoint is exposed to the router, can be invoked directly, but is not available to the client
     * - `http` - the endpoint is only exposed to the router
     * @default "rpc"
     */
    scope?: "rpc" | "server" | "http";
    /**
     * List of allowed media types (MIME types) for the endpoint
     *
     * if provided, only the media types in the list will be allowed to be passed in the body
     *
     * @example
     * ```ts
     * const endpoint = createEndpoint("/path", {
     * 		method: "POST",
     * 		allowedMediaTypes: ["application/json", "application/x-www-form-urlencoded"],
     * 	}, async(ctx)=>{
     * 		const body = ctx.body
     * 	})
     * ```
     */
    allowedMediaTypes?: string[];
    /**
     * Extra metadata
     */
    [key: string]: any;
  };
  /**
   * List of middlewares to use
   */
  use?: MiddlewareHandler[] | undefined;
  /**
   * A callback to run before any API error is throw or returned
   *
   * @param e - The API error
   * @returns - The response to return
   */
  onAPIError?: (e: APIError) => void | Promise<void>;
  /**
   * A callback to run before a validation error is thrown
   * You can customize the validation error message by throwing your own APIError
   */
  onValidationError?: ({ issues, message }: {
    message: string;
    issues: readonly StandardSchemaV1.Issue[];
  }) => void | Promise<void>;
}
type EndpointBodyMethodOptions = {
  /**
   * Request Method
   */
  method: "POST" | "PUT" | "DELETE" | "PATCH" | ("POST" | "PUT" | "DELETE" | "PATCH")[];
  /**
   * Body Schema
   */
  body?: StandardSchemaV1;
} | {
  /**
   * Request Method
   */
  method: "GET" | "HEAD" | ("GET" | "HEAD")[];
  /**
   * Body Schema
   */
  body?: never;
} | {
  /**
   * Request Method
   */
  method: "*";
  /**
   * Body Schema
   */
  body?: StandardSchemaV1;
} | {
  /**
   * Request Method
   */
  method: ("POST" | "PUT" | "DELETE" | "PATCH" | "GET" | "HEAD")[];
  /**
   * Body Schema
   */
  body?: StandardSchemaV1;
};
type EndpointOptions = EndpointBaseOptions & EndpointBodyMethodOptions;
type StrictEndpoint<Path extends string, Options extends EndpointOptions, R = any> = {
  (context: InputContext<Path, Options> & {
    asResponse: true;
  }): Promise<Response>;
  (context: InputContext<Path, Options> & {
    returnHeaders: true;
    returnStatus: true;
  }): Promise<{
    headers: Headers;
    status: number;
    response: Awaited<R>;
  }>;
  (context: InputContext<Path, Options> & {
    returnHeaders: true;
    returnStatus: false;
  }): Promise<{
    headers: Headers;
    response: Awaited<R>;
  }>;
  (context: InputContext<Path, Options> & {
    returnHeaders: false;
    returnStatus: true;
  }): Promise<{
    status: number;
    response: Awaited<R>;
  }>;
  (context: InputContext<Path, Options> & {
    returnHeaders: false;
    returnStatus: false;
  }): Promise<R>;
  (context: InputContext<Path, Options> & {
    returnHeaders: true;
  }): Promise<{
    headers: Headers;
    response: Awaited<R>;
  }>;
  (context: InputContext<Path, Options> & {
    returnStatus: true;
  }): Promise<{
    status: number;
    response: Awaited<R>;
  }>;
  (context?: InputContext<Path, Options>): Promise<R>;
  options: Options;
  path: Path;
};
type ExtractWildcards<TPath extends string, Count extends readonly unknown[] = []> = TPath extends `${string}**:${infer Rest}` ? Rest extends `${infer Param}/${infer Tail}` ? Param | ExtractWildcards<Tail, Count> : Rest : TPath extends `${string}*${infer Rest}` ? Rest extends `*` ? `_` : `${Count["length"]}` | ExtractWildcards<Rest, [...Count, unknown]> : TPath extends `${string}/${infer Rest}` ? ExtractWildcards<Rest, Count> : never;
type ExtractNamedParams<TPath extends string> = TPath extends `${infer _Start}:${infer Rest}` ? Rest extends `${infer Param}/${infer Tail}` ? Param | ExtractNamedParams<`/${Tail}`> : Rest extends `${infer Param}*${infer Tail}` ? Param | ExtractNamedParams<`/${Tail}`> : Rest : TPath extends `/${infer Rest}` ? ExtractNamedParams<Rest> : never;
type InferRouteParams<TPath extends string> = { [K in ExtractNamedParams<TPath> | ExtractWildcards<TPath>]: string; };
//#region src/context.d.ts
type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type InferBodyInput<Options extends EndpointOptions | MiddlewareOptions, Body = Options["metadata"] extends {
  $Infer: {
    body: infer B;
  };
} ? B : Options["body"] extends StandardSchemaV1 ? StandardSchemaV1.InferInput<Options["body"]> : undefined> = undefined extends Body ? {
  body?: Body;
} : {
  body: Body;
};
type InferQueryInput<Options extends EndpointOptions | MiddlewareOptions, Query = Options["metadata"] extends {
  $Infer: {
    query: infer Query;
  };
} ? Query : Options["query"] extends StandardSchemaV1 ? StandardSchemaV1.InferInput<Options["query"]> : Record<string, any> | undefined> = undefined extends Query ? {
  query?: Query;
} : {
  query: Query;
};
type InferInputMethod<Options extends EndpointOptions, Method = Options["method"] extends Array<any> ? Options["method"][number] | undefined : Options["method"] extends "*" ? HTTPMethod : Options["method"] | undefined> = undefined extends Method ? {
  method?: Method;
} : {
  method: Method;
};
type TrailingWildcardKey<Path extends string> = Path extends `${infer Prefix}/*${"" | "/"}` ? Exclude<keyof InferRouteParams<Path>, keyof InferRouteParams<Prefix>> : never;
type RouteParams<Path extends string> = { [Key in keyof InferRouteParams<Path>]: Key extends TrailingWildcardKey<Path> ? InferRouteParams<Path>[Key] | undefined : InferRouteParams<Path>[Key]; };
type InferParamInput<Path extends string> = string extends Path ? {
  params?: Record<string, string | undefined>;
} : [Path] extends [never] ? {
  params?: Record<string, string | undefined>;
} : IsEmptyObject<RouteParams<Path>> extends true ? {
  params?: Record<string, string | undefined>;
} : {
  params: Prettify<RouteParams<Path>>;
};
type InferRequestInput<Option extends EndpointOptions | MiddlewareOptions> = Option["requireRequest"] extends true ? {
  request: Request;
} : {
  request?: Request | undefined;
};
type InferHeadersInput<Option extends EndpointOptions | MiddlewareOptions> = Option["requireHeaders"] extends true ? {
  headers: HeadersInit;
} : {
  headers?: HeadersInit | undefined;
};
type InputContext<Path extends string, Options extends EndpointOptions> = InferBodyInput<Options> & InferInputMethod<Options> & InferQueryInput<Options> & InferParamInput<Path> & InferRequestInput<Options> & InferHeadersInput<Options> & {
  asResponse?: boolean;
  returnHeaders?: boolean;
  returnStatus?: boolean;
  use?: MiddlewareHandler[];
  path?: string;
  context?: Record<string, any>;
};
//#region src/middleware.d.ts
interface MiddlewareOptions extends Omit<EndpointOptions, "method"> {}
type MiddlewareInputContext<Options extends MiddlewareOptions> = InferBodyInput<Options> & InferQueryInput<Options> & InferRequestInput<Options> & InferHeadersInput<Options> & {
  asResponse?: boolean;
  returnHeaders?: boolean;
  use?: MiddlewareHandler[];
};
type MiddlewareFunction = (...args: never[]) => Promise<unknown>;
type MiddlewareHandler = (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<unknown>;
type Middleware<Options extends MiddlewareOptions = MiddlewareOptions, Handler extends MiddlewareFunction = MiddlewareHandler> = Handler & {
  options: Options;
};
type TelegramUser = User & {
  telegramId?: string | null;
  telegramPhoneNumber?: string | null;
  telegramUsername?: string | null;
};
/** One bot after defaults are applied. */
interface ResolvedTelegramBot {
  key: string;
  oidc?: {
    clientId: string;
    clientSecret: string;
  };
  oidcProviderId?: string;
  token: string;
  username: string;
}
/**
 * Resolved configuration for the Telegram plugin.
 * Created from `TelegramPluginOptions` with all defaults applied.
 */
interface TelegramPluginConfig {
  allowUserToLink: boolean;
  autoCreateUser: boolean;
  bots: ResolvedTelegramBot[];
  /** First bot token, kept for internal compatibility. */
  botToken: string;
  /** First bot username, kept for internal compatibility. */
  botUsername: string;
  mapMiniAppDataToUser?: NonNullable<TelegramPluginOptions["miniApp"]>["mapMiniAppDataToUser"];
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
 * The Telegram columns. Built per plugin instance and typed with literal
 * types (not widened to `BetterAuthPluginDBSchema`), so Better Auth infers
 * them on `session.user`, server and client, as it does for its own plugins'
 * schemas.
 */
declare function telegramSchema(): {
  user: {
    fields: {
      telegramId: {
        type: "string";
        required: false;
        unique: false;
        index: true;
        input: false;
      };
      telegramPhoneNumber: {
        type: "string";
        required: false;
        unique: false;
        input: false;
      };
      telegramUsername: {
        type: "string";
        required: false;
        unique: false;
        input: false;
      };
    };
  };
  account: {
    fields: {
      telegramId: {
        type: "string";
        required: false;
        unique: false;
      };
      telegramUsername: {
        type: "string";
        required: false;
        unique: false;
      };
    };
  };
};
type TelegramSchema = ReturnType<typeof telegramSchema>;
declare const TELEGRAM_ERROR_CODES: {
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
/**
 * Creates a Telegram OIDC provider for Better Auth's social login system.
 *
 * Authorization Code flow with PKCE and a nonce via oauth.telegram.org.
 * The token endpoint is called with HTTP Basic client authentication, and
 * the returned ID token is verified against Telegram's JWKS (signature,
 * issuer, audience, expiry, nonce) before any claim is trusted.
 *
 * @param botToken - Bot token from @BotFather (bot ID is the default client_id)
 * @param options - OIDC configuration options
 * @param logger - Where sign-in diagnostics go; the plugin passes Better
 *   Auth's logger (`ctx.logger`)
 * @param providerId - Better Auth social provider id; defaults to
 *   `telegram-oidc`, the id existing accounts are stored under
 */
declare function createTelegramOIDCProvider(botToken: string, options?: TelegramOIDCOptions, logger?: {
  warn: (message: string, ...args: unknown[]) => void;
}, providerId?: string): OAuthProvider<TelegramOIDCClaims>;
/**
 * Telegram authentication plugin for Better Auth
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { telegram } from "better-auth-telegram";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     telegram({
 *       botToken: process.env.TELEGRAM_BOT_TOKEN!,
 *       botUsername: "your_bot_username"
 *     })
 *   ]
 * });
 * ```
 */
declare const telegram: (options: TelegramPluginOptions) => {
  id: "telegram";
  init: (ctx: import("better-auth").AuthContext) => {
    context?: {
      socialProviders: import("better-auth").OAuthProvider<object, Partial<import("better-auth").ProviderOptions<object>>>[];
    } | undefined;
    options: {
      databaseHooks: {
        user?: {
          create?: {
            before?: (user: import("better-auth").User & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                email?: string | undefined;
                emailVerified?: boolean | undefined;
                name?: string | undefined;
                image?: string | null | undefined;
              } & Record<string, any>;
            }>;
            after?: (user: import("better-auth").User & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          update?: {
            before?: (user: Partial<import("better-auth").User> & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                [x: string]: any;
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                email?: string | undefined;
                emailVerified?: boolean | undefined;
                name?: string | undefined;
                image?: string | null | undefined;
              };
            }>;
            after?: (user: import("better-auth").User & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          delete?: {
            before?: (user: import("better-auth").User & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void>;
            after?: (user: import("better-auth").User & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
        };
        session?: {
          create?: {
            before?: (session: import("better-auth").Session & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                userId?: string | undefined;
                expiresAt?: Date | undefined;
                token?: string | undefined;
                ipAddress?: string | null | undefined;
                userAgent?: string | null | undefined;
              } & Record<string, any>;
            }>;
            after?: (session: import("better-auth").Session & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          update?: {
            before?: (session: Partial<import("better-auth").Session> & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                [x: string]: any;
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                userId?: string | undefined;
                expiresAt?: Date | undefined;
                token?: string | undefined;
                ipAddress?: string | null | undefined;
                userAgent?: string | null | undefined;
              };
            }>;
            after?: (session: import("better-auth").Session & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          delete?: {
            before?: (session: import("better-auth").Session & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void>;
            after?: (session: import("better-auth").Session & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
        };
        account?: {
          create?: {
            before?: (account: import("better-auth").Account, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                providerId?: string | undefined;
                accountId?: string | undefined;
                userId?: string | undefined;
                accessToken?: string | null | undefined;
                refreshToken?: string | null | undefined;
                idToken?: string | null | undefined;
                accessTokenExpiresAt?: Date | null | undefined;
                refreshTokenExpiresAt?: Date | null | undefined;
                scope?: string | null | undefined;
                password?: string | null | undefined;
              } & Record<string, any>;
            }>;
            after?: (account: import("better-auth").Account, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          update?: {
            before?: (account: Partial<import("better-auth").Account> & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                [x: string]: any;
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                providerId?: string | undefined;
                accountId?: string | undefined;
                userId?: string | undefined;
                accessToken?: string | null | undefined;
                refreshToken?: string | null | undefined;
                idToken?: string | null | undefined;
                accessTokenExpiresAt?: Date | null | undefined;
                refreshTokenExpiresAt?: Date | null | undefined;
                scope?: string | null | undefined;
                password?: string | null | undefined;
              };
            }>;
            after?: (account: import("better-auth").Account & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          delete?: {
            before?: (account: import("better-auth").Account & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void>;
            after?: (account: import("better-auth").Account & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
        };
        verification?: {
          create?: {
            before?: (verification: import("better-auth").Verification & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                value?: string | undefined;
                expiresAt?: Date | undefined;
                identifier?: string | undefined;
              } & Record<string, any>;
            }>;
            after?: (verification: import("better-auth").Verification & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          update?: {
            before?: (verification: Partial<import("better-auth").Verification> & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void | {
              data: {
                [x: string]: any;
                id?: string | undefined;
                createdAt?: Date | undefined;
                updatedAt?: Date | undefined;
                value?: string | undefined;
                expiresAt?: Date | undefined;
                identifier?: string | undefined;
              };
            }>;
            after?: (verification: import("better-auth").Verification & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
          delete?: {
            before?: (verification: import("better-auth").Verification & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<boolean | void>;
            after?: (verification: import("better-auth").Verification & Record<string, unknown>, context: import("better-auth").GenericEndpointContext | null) => Promise<void>;
          };
        };
      };
    };
  };
  schema: TelegramSchema;
  endpoints: {
    getTelegramConfig: StrictEndpoint<"/telegram/config", {
      method: "GET";
    }, {
      botUsername: string;
      loginWidgetEnabled: boolean;
      miniAppEnabled: boolean;
      oidcEnabled: boolean;
      testMode: boolean;
      bots: {
        key: string;
        username: string;
      }[];
    }>;
    signInWithMiniApp?: StrictEndpoint<"/telegram/miniapp/signin", {
      method: "POST";
      use: Middleware<MiddlewareOptions, (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void>>[];
    }, {
      user: TelegramUser;
      session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
      };
    }> | undefined;
    validateMiniApp?: StrictEndpoint<"/telegram/miniapp/validate", {
      method: "POST";
    }, {
      valid: boolean;
      data: null;
    } | {
      valid: boolean;
      data: TelegramMiniAppData;
      botId: string | undefined;
    }> | undefined;
    signInWithTelegram?: StrictEndpoint<"/telegram/signin", {
      method: "POST";
      use: Middleware<MiddlewareOptions, (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<void>>[];
    }, {
      user: TelegramUser;
      session: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        expiresAt: Date;
        token: string;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
      };
    }> | undefined;
    linkTelegram?: StrictEndpoint<"/telegram/link", {
      method: "POST";
      use: Middleware<MiddlewareOptions, (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>>[];
    }, {
      success: boolean;
      message: "Telegram account linked successfully";
    }> | undefined;
    unlinkTelegram?: StrictEndpoint<"/telegram/unlink", {
      method: "POST";
      use: Middleware<MiddlewareOptions, (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{
        session: {
          session: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            token: string;
            ipAddress?: string | null | undefined;
            userAgent?: string | null | undefined;
          };
          user: Record<string, any> & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            email: string;
            emailVerified: boolean;
            name: string;
            image?: string | null | undefined;
          };
        };
      }>>[];
    }, {
      success: boolean;
      message: "Telegram account unlinked successfully";
    }> | undefined;
  };
  hooks: {
    after: {
      matcher: () => boolean;
      handler: Middleware<MiddlewareOptions, (inputContext: MiddlewareInputContext<MiddlewareOptions>) => Promise<{
        user: {
          id: string;
          createdAt: Date;
          updatedAt: Date;
          email: string;
          emailVerified: boolean;
          name: string;
          image?: string | null | undefined;
        };
      } | undefined>>;
    }[];
  };
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
  rateLimit: ({
    pathMatcher: (path: string) => path is "/telegram/miniapp/signin";
    window: number;
    max: number;
  } | {
    pathMatcher: (path: string) => path is "/telegram/miniapp/validate";
    window: number;
    max: number;
  } | {
    pathMatcher: (path: string) => path is "/telegram/signin";
    window: number;
    max: number;
  } | {
    pathMatcher: (path: string) => path is "/telegram/link";
    window: number;
    max: number;
  } | {
    pathMatcher: (path: string) => path is "/telegram/unlink";
    window: number;
    max: number;
  })[];
};
declare module "@better-auth/core" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    telegram: {
      creator: typeof telegram;
    };
  }
}
export { TelegramAccountRecord as a, TelegramBotOIDCOptions as c, TelegramMiniAppData as d, TelegramMiniAppUser as f, TelegramPluginOptions as h, TelegramPluginConfig as i, TelegramMappedUser as l, TelegramOIDCOptions as m, createTelegramOIDCProvider as n, TelegramAuthData as o, TelegramOIDCClaims as p, TELEGRAM_ERROR_CODES as r, TelegramBotDefinition as s, telegram as t, TelegramMiniAppChat as u };
//# sourceMappingURL=index-8lPGA0f8.d.cts.map