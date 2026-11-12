/** Stable imports for tests; the fixtures themselves stay grouped by responsibility. */
// biome-ignore lint/performance/noBarrelFile: Tests share this compatibility facade while fixture modules avoid circular imports.
export {
  type AuthOptions,
  baseOptions,
  createMemoryAuth,
  createSqliteAuth,
  type MemoryDB,
} from "./auth";
export { MULTI_BOTS, multiBots } from "./bots";
export {
  BASE_URL,
  BOT_ID,
  BOT_TOKEN,
  MINI_APP_SIGNATURE,
  SECOND_BOT_ID,
  SECOND_BOT_TOKEN,
} from "./constants";
export { createClient, type TestClient } from "./http-client";
export { signInWithTelegramOIDC, telegramClaims } from "./oidc-flow";
export {
  type AuthorizeOptions,
  mockTelegramOIDC,
  type TelegramOIDCMock,
} from "./oidc-server";
export { signInitData, signInitParams, signWidgetData } from "./signed-data";
