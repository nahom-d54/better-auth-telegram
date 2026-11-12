import type { AuthContext } from "@better-auth/core";
import { PLUGIN_ID } from "./constants";

/**
 * The provider ids configured for one Better Auth instance: the HMAC
 * `telegram` provider plus every OIDC provider registered by `init`.
 *
 * A module-level constant cannot express this, because one process may run
 * several Better Auth instances with different bots.
 */
const providerIdsByInstance = new WeakMap<object, ReadonlySet<string>>();
const HMAC_ONLY: ReadonlySet<string> = new Set([PLUGIN_ID]);

export function rememberTelegramProviderIds(
  ctx: AuthContext,
  oidcProviderIds: readonly string[]
) {
  // The adapter is one object per Better Auth instance and is stable between
  // `init` and endpoint contexts (the operation locks rely on the same).
  providerIdsByInstance.set(
    ctx.adapter,
    new Set([PLUGIN_ID, ...oidcProviderIds])
  );
}

function providerIds(ctx: AuthContext): ReadonlySet<string> {
  return providerIdsByInstance.get(ctx.adapter) ?? HMAC_ONLY;
}

/** Whether `providerId` is an OIDC provider configured by this instance. */
export function isOIDCProvider(ctx: AuthContext, providerId: string): boolean {
  return providerId !== PLUGIN_ID && providerIds(ctx).has(providerId);
}

/** Whether `providerId` is any provider configured by this instance. */
export function isTelegramProvider(
  ctx: AuthContext,
  providerId: string
): boolean {
  return providerIds(ctx).has(providerId);
}
