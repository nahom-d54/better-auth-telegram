import { a as SUCCESS_MESSAGES, c as TELEGRAM_OIDC_JWKS_URI, d as TELEGRAM_ERROR_CODES, i as PLUGIN_ID, l as TELEGRAM_OIDC_PROVIDER_ID, n as ERROR_CODES, o as TELEGRAM_OIDC_AUTH_ENDPOINT, r as PLACEHOLDER_EMAIL_DOMAINS, s as TELEGRAM_OIDC_ISSUER, t as DEFAULT_MAX_AUTH_AGE, u as TELEGRAM_OIDC_TOKEN_ENDPOINT } from "./constants-C5lUJDkQ.js";
import { APIError, createAuthEndpoint, createAuthMiddleware, formCsrfMiddleware, freshSessionMiddleware, getOAuthState, isAPIError, sensitiveSessionMiddleware } from "better-auth/api";
import { defineRequestState, getCurrentAdapter, hasRequestState, runWithTransaction, tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import { APIError as APIError$1, BASE_ERROR_CODES } from "@better-auth/core/error";
import { createPlaceholderEmail } from "@better-auth/core/utils/email";
import { parseAdditionalUserInputFromProviderProfile, parseSessionOutput, parseUserOutput } from "better-auth/db";
import { setSessionCookie } from "better-auth/cookies";
import { createAuthorizationURL, validateAuthorizationCode } from "@better-auth/core/oauth2";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { applyUpdateUserInfoOnLink, setTokenUtil } from "better-auth/oauth2";
// src/config-endpoint.ts
/**
* Creates the GET /telegram/config endpoint.
* Always registered regardless of which flows are enabled.
*
* `?bot=<key>` selects a bot; without it the first bot is described.
*/
function createConfigEndpoint(config) {
	return { getTelegramConfig: createAuthEndpoint("/telegram/config", { method: "GET" }, (ctx) => {
		const key = typeof ctx.query?.bot === "string" ? ctx.query.bot : "";
		const bot = key ? config.bots.find((candidate) => candidate.key === key) : config.bots[0];
		if (!bot) throw APIError.from("NOT_FOUND", {
			code: "BOT_NOT_FOUND",
			message: `Unknown Telegram bot "${key}"`
		});
		return ctx.json({
			botUsername: bot.username,
			loginWidgetEnabled: config.widgetEnabled,
			miniAppEnabled: config.miniAppEnabled,
			oidcEnabled: config.oidcEnabled,
			testMode: config.testMode,
			bots: config.bots.map((candidate) => ({
				key: candidate.key,
				username: candidate.username
			}))
		});
	}) };
}
// src/telegram-providers.ts
/**
* The provider ids configured for one Better Auth instance: the HMAC
* `telegram` provider plus every OIDC provider registered by `init`.
*
* A module-level constant cannot express this, because one process may run
* several Better Auth instances with different bots.
*/
const providerIdsByInstance = /* @__PURE__ */ new WeakMap();
const HMAC_ONLY = /* @__PURE__ */ new Set([PLUGIN_ID]);
function rememberTelegramProviderIds(ctx, oidcProviderIds) {
	providerIdsByInstance.set(ctx.adapter, /* @__PURE__ */ new Set([PLUGIN_ID, ...oidcProviderIds]));
}
function providerIds(ctx) {
	return providerIdsByInstance.get(ctx.adapter) ?? HMAC_ONLY;
}
/** Whether `providerId` is an OIDC provider configured by this instance. */
function isOIDCProvider(ctx, providerId) {
	return providerId !== "telegram" && providerIds(ctx).has(providerId);
}
/** Whether `providerId` is any provider configured by this instance. */
function isTelegramProvider(ctx, providerId) {
	return providerIds(ctx).has(providerId);
}
// src/telegram-account-state.ts
function accountData(userId, identity) {
	return {
		userId,
		providerId: PLUGIN_ID,
		accountId: identity.telegramId,
		telegramId: identity.telegramId,
		telegramUsername: identity.username
	};
}
function findUserByTelegramId(ctx, telegramId) {
	return ctx.context.adapter.findOne({
		model: "user",
		where: [{
			field: "telegramId",
			value: telegramId
		}]
	});
}
async function hasLinkedTelegramIdentity(ctx, userId, telegramId) {
	return (await ctx.context.internalAdapter.findAccounts(userId)).some((account) => account.providerId === "telegram" && account.accountId === telegramId || isOIDCProvider(ctx.context, account.providerId) && account.telegramId === telegramId);
}
/** Same-owner legacy duplicates are harmless; different owners are ambiguous. */
async function findTelegramAccount(ctx, telegramId) {
	const adapter = await getCurrentAdapter(ctx.context.adapter);
	const where = [{
		field: "providerId",
		value: PLUGIN_ID
	}, {
		field: "accountId",
		value: telegramId
	}];
	const [account, duplicate] = await adapter.findMany({
		model: "account",
		where,
		limit: 2
	});
	if (!(account && duplicate)) return account ?? null;
	if (duplicate.userId !== account.userId || await adapter.findOne({
		model: "account",
		where: [...where, {
			field: "userId",
			value: account.userId,
			operator: "ne"
		}]
	})) throw APIError.from("CONFLICT", ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
	return account;
}
/**
* Runs the app's `user.validateUserInfo` gate for actions Better Auth's
* internal adapter does not cover (`create-user` is checked by `createUser`).
* Fails closed, like Better Auth's own gate.
*/
async function assertValidUserInfo(ctx, user, action, method) {
	const validate = ctx.context.options.user?.validateUserInfo;
	if (!validate) return;
	let result;
	try {
		result = await validate({
			user,
			source: {
				method,
				action
			}
		}, ctx);
	} catch (error) {
		ctx.context.logger.error("validateUserInfo callback threw", error);
		throw new APIError("FORBIDDEN", {
			code: "validation_failed",
			message: "User validation failed",
			cause: error
		});
	}
	if (result?.error) throw new APIError("FORBIDDEN", {
		code: result.error,
		message: result.errorDescription || result.error
	});
}
/** Identity and user operations in progress, per Better Auth instance. */
const inProgress = /* @__PURE__ */ new WeakMap();
/**
* Runs `task` once every earlier task for the same operation key on this
* Better Auth instance has settled. A double-submitted first sign-in (React
* strict mode, a double click) would otherwise create the user twice, or
* link a second account to the user the first request just created.
*/
async function withTelegramOperation(ctx, operationKey, task) {
	const key = ctx.context.adapter;
	let tasks = inProgress.get(key);
	if (!tasks) {
		tasks = /* @__PURE__ */ new Map();
		inProgress.set(key, tasks);
	}
	const current = (tasks.get(operationKey) ?? Promise.resolve()).then(task);
	const settled = current.then(() => void 0, () => void 0);
	tasks.set(operationKey, settled);
	try {
		return await current;
	} finally {
		if (tasks.get(operationKey) === settled) tasks.delete(operationKey);
	}
}
// src/telegram-account-user.ts
/** Application hooks may revoke or move the account while a sign-in is awaiting them. */
async function requireAccountOwner(ctx, userId, telegramId) {
	const account = await findTelegramAccount(ctx, telegramId);
	if (!account || account.userId !== userId) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
	return account;
}
/** Keeps the stored Telegram username current (it can change at any time). */
async function refreshIdentity(ctx, user, account, identity) {
	const username = identity.username ?? null;
	const accountChanged = (account.telegramUsername ?? null) !== username;
	if (accountChanged) await ctx.context.internalAdapter.updateAccount(account.id, { telegramUsername: username });
	const userUpdate = {};
	if (!user.telegramId) userUpdate.telegramId = identity.telegramId;
	if ((!user.telegramId || user.telegramId === identity.telegramId) && (user.telegramUsername ?? null) !== username) userUpdate.telegramUsername = username;
	if (Object.keys(userUpdate).length === 0) {
		if (accountChanged) await requireAccountOwner(ctx, user.id, identity.telegramId);
		return user;
	}
	const updated = await ctx.context.internalAdapter.updateUser(user.id, userUpdate) ?? user;
	await requireAccountOwner(ctx, user.id, identity.telegramId);
	return updated;
}
/** Signs a returning Telegram user in through their `telegram` account. */
async function signInWithAccount(ctx, account, identity, method) {
	const user = await ctx.context.internalAdapter.findUserById(account.userId);
	if (!user) throw APIError.from("INTERNAL_SERVER_ERROR", ERROR_CODES.ORPHANED_ACCOUNT);
	await assertValidUserInfo(ctx, {
		...user,
		telegramUsername: identity.username ?? null
	}, "sign-in", method);
	return await refreshIdentity(ctx, user, await requireAccountOwner(ctx, user.id, identity.telegramId), identity);
}
/**
* Creates the user and their `telegram` account, in a transaction. Mapper
* output goes through Better Auth's provider-profile parsing, as OAuth
* sign-ups do: no `id`, no `emailVerified` (nothing verified the mapper's
* email), no `input: false` or unknown fields.
*/
async function createTelegramUser(ctx, options, email) {
	const { identity, method } = options;
	const { internalAdapter } = ctx.context;
	const { id: _id, email: _email, emailVerified: _emailVerified, name, image, ...profile } = options.userData;
	return await runWithTransaction(ctx.context.adapter, async () => {
		const user = await internalAdapter.createUser({
			...parseAdditionalUserInputFromProviderProfile(ctx.context.options, profile, "create"),
			name: name ?? "",
			image,
			email,
			emailVerified: false,
			telegramId: identity.telegramId,
			telegramUsername: identity.username
		}, { method });
		if (!user) throw APIError.from("FORBIDDEN", ERROR_CODES.USER_CREATION_REJECTED);
		if (!await internalAdapter.createAccount(accountData(user.id, identity))) throw APIError.from("FORBIDDEN", ERROR_CODES.ACCOUNT_CREATION_REJECTED);
		return user;
	});
}
// src/telegram-identity-state.ts
/**
* The Telegram ID token verified during the current request. Set by the
* OIDC provider's `getUserInfo`, read by the hooks below.
*/
const verifiedSignIn = defineRequestState(() => null);
async function rememberVerifiedClaims(claims, userInfo, providerId) {
	if (await hasRequestState()) await verifiedSignIn.set({
		claims,
		userInfo,
		providerId,
		changedUserIds: /* @__PURE__ */ new Set()
	});
}
async function currentSignIn() {
	return await hasRequestState() ? await verifiedSignIn.get() : null;
}
async function currentClaims() {
	return (await currentSignIn())?.claims ?? null;
}
async function markChanged(userId) {
	(await currentSignIn())?.changedUserIds.add(userId);
}
// src/telegram-identity-sync.ts
/**
* Copies the Telegram identity from a verified OIDC ID token onto the user:
* the Telegram user id (`id` claim — `sub` is scoped to one bot), the
* username and, with the `phone` scope, the phone number. The OIDC account
* row gets the id too, so the identity can be re-checked when accounts are
* removed.
*
* This lets the Login Widget and Mini App flows, which look users up by
* `telegramId`, find users that signed up with OIDC.
*/
async function syncTelegramIdentity(ctx, userId, claims, account) {
	if (claims.id === void 0) return;
	await runWithTransaction(ctx.adapter, async () => {
		const telegramId = String(claims.id);
		const username = claims.preferred_username ?? null;
		if (account.telegramId !== telegramId || (account.telegramUsername ?? null) !== username) {
			if (!await ctx.internalAdapter.updateAccount(account.id, {
				telegramId,
				telegramUsername: username
			})) throw APIError.from("FORBIDDEN", ERROR_CODES.IDENTITY_UPDATE_REJECTED);
		}
		const user = await ctx.internalAdapter.findUserById(userId);
		if (!user) return;
		if (user.telegramId && user.telegramId !== telegramId) return;
		if (!user.telegramId) {
			const owner = await (await getCurrentAdapter(ctx.adapter)).findOne({
				model: "user",
				where: [{
					field: "telegramId",
					value: telegramId
				}]
			});
			if (owner && owner.id !== userId) {
				ctx.logger.warn("[better-auth-telegram] OIDC: another user already has this Telegram id; not copying it.", {
					userId,
					otherUserId: owner.id
				});
				return;
			}
		}
		const update = {};
		if (user.telegramId !== telegramId) update.telegramId = telegramId;
		if ((user.telegramUsername ?? null) !== username) update.telegramUsername = username;
		if (claims.phone_number && user.telegramPhoneNumber !== claims.phone_number) update.telegramPhoneNumber = claims.phone_number;
		if (Object.keys(update).length > 0) {
			if (!await ctx.internalAdapter.updateUser(userId, update)) throw APIError.from("FORBIDDEN", ERROR_CODES.IDENTITY_UPDATE_REJECTED);
			await markChanged(userId);
		}
	});
}
/** The user's OIDC account that the verified claims belong to, if any. */
async function accountProvenByClaims(ctx, userId, claims, providerId) {
	return (await ctx.internalAdapter.findAccounts(userId)).find((account) => account.providerId === providerId && account.accountId === claims.sub);
}
/**
* Keeps `user.telegramId` backed by a linked Telegram account. Called after a
* Telegram account is removed (by `/telegram/unlink`, Better Auth's
* `/unlink-account` or anything else): if no remaining account proves the
* stored Telegram id, it switches to one that does or clears it, so an
* unlinked Telegram user can no longer sign in through the Login Widget or
* Mini App lookup by `telegramId`.
*/
async function reconcileTelegramIdentity(ctx, userId) {
	const user = await ctx.internalAdapter.findUserById(userId);
	if (!user?.telegramId) return;
	const proving = (await ctx.internalAdapter.findAccounts(userId)).filter((account) => isTelegramProvider(ctx, account.providerId) && account.telegramId);
	if (proving.some((account) => account.telegramId === user.telegramId)) return;
	const [next] = proving;
	if (!await ctx.internalAdapter.updateUser(userId, {
		telegramId: next?.telegramId ?? null,
		telegramUsername: next?.telegramUsername ?? null,
		telegramPhoneNumber: null
	})) throw APIError.from("FORBIDDEN", ERROR_CODES.IDENTITY_UPDATE_REJECTED);
}
// src/telegram-account-link.ts
/**
* Links a verified Telegram identity to the signed-in user. A user has at
* most one Telegram identity: linking a different one is refused.
*/
async function linkTelegramAccount(ctx, user, identity) {
	await withTelegramOperation(ctx, `telegram:${identity.telegramId}`, () => withTelegramOperation(ctx, `user:${user.id}`, () => link(ctx, user, identity)));
}
async function link(ctx, user, identity) {
	const account = await findTelegramAccount(ctx, identity.telegramId);
	if (account) throw APIError.from("CONFLICT", account.userId === user.id ? ERROR_CODES.TELEGRAM_ALREADY_LINKED_SELF : ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
	const owner = await findUserByTelegramId(ctx, identity.telegramId);
	if (owner && owner.id !== user.id) throw APIError.from("CONFLICT", ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
	const current = await ctx.context.internalAdapter.findUserById(user.id);
	if (current?.telegramId && current.telegramId !== identity.telegramId) throw APIError.from("CONFLICT", ERROR_CODES.DIFFERENT_TELEGRAM_ACCOUNT_LINKED);
	await assertValidUserInfo(ctx, current ?? user, "link-account", "telegram-login-widget");
	await runWithTransaction(ctx.context.adapter, async () => {
		if (!await ctx.context.internalAdapter.linkAccount(accountData(user.id, identity))) throw APIError.from("FORBIDDEN", ERROR_CODES.ACCOUNT_CREATION_REJECTED);
		if (!await ctx.context.internalAdapter.updateUser(user.id, {
			telegramId: identity.telegramId,
			telegramUsername: identity.username ?? null
		})) throw APIError.from("FORBIDDEN", ERROR_CODES.IDENTITY_UPDATE_REJECTED);
	});
}
/**
* Removes the Login Widget / Mini App account from the signed-in user.
* Refuses to remove the user's only account unless Better Auth's
* `account.accountLinking.allowUnlinkingAll` is set. The Telegram identity
* on the user is re-checked by the `account.delete` hook.
*/
async function unlinkTelegramAccount(ctx, userId) {
	return await withTelegramOperation(ctx, `user:${userId}`, () => runWithTransaction(ctx.context.adapter, () => unlink(ctx, userId)));
}
async function unlink(ctx, userId) {
	const { internalAdapter } = ctx.context;
	const accounts = await internalAdapter.findAccounts(userId);
	const telegramAccounts = accounts.filter((account) => account.providerId === PLUGIN_ID);
	if (telegramAccounts.length === 0) throw APIError.from("NOT_FOUND", ERROR_CODES.NOT_LINKED);
	const allowUnlinkingAll = ctx.context.options.account?.accountLinking?.allowUnlinkingAll === true;
	if (accounts.length === telegramAccounts.length && !allowUnlinkingAll) throw APIError.from("BAD_REQUEST", ERROR_CODES.CANNOT_UNLINK_LAST_ACCOUNT);
	await Promise.all(telegramAccounts.map((account) => internalAdapter.deleteAccount(account.id)));
	if ((await internalAdapter.findAccounts(userId)).some((account) => account.providerId === "telegram")) throw APIError.from("FORBIDDEN", ERROR_CODES.ACCOUNT_UNLINK_REJECTED);
	await reconcileTelegramIdentity(ctx.context, userId);
}
// src/telegram-session.ts
/**
* Creates a session for `user`, sets the session cookie and answers with
* both, filtered like Better Auth's own sign-in responses (no
* `returned: false` fields).
*/
async function startSession(ctx, user) {
	const session = await ctx.context.internalAdapter.createSession(user.id);
	if (!session) throw APIError.from("UNAUTHORIZED", BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION);
	await setSessionCookie(ctx, {
		session,
		user
	});
	return ctx.json({
		user: parseUserOutput(ctx.context.options, user),
		session: parseSessionOutput(ctx.context.options, session)
	});
}
/**
* Re-issues the session cookie with the user as stored now, like Better
* Auth's /update-user, so `session.cookieCache` doesn't keep serving the
* Telegram identity from before a link or unlink.
*/
async function refreshSessionCookie(ctx, session) {
	const user = await ctx.context.internalAdapter.findUserById(session.user.id);
	if (user) await setSessionCookie(ctx, {
		session: session.session,
		user
	});
}
// src/telegram-account.ts
/**
* Finds the user for a verified Telegram identity, linking or creating the
* Telegram account when needed:
*
* 1. an account `telegram/<id>` → its user;
* 2. a user with this `telegramId` (Mini App, Login Widget or OIDC) → link;
* 3. otherwise create the user and account, when `allowCreate` is set.
*
* Writes go through Better Auth's internal adapter, so `databaseHooks` apply,
* and `user.validateUserInfo` sees every sign-in, link and sign-up.
*/
async function findOrCreateTelegramUser(ctx, options) {
	return await withTelegramOperation(ctx, `telegram:${options.identity.telegramId}`, () => findOrCreate(ctx, options));
}
async function findOrCreate(ctx, options) {
	const { identity, method } = options;
	const { internalAdapter } = ctx.context;
	const account = await findTelegramAccount(ctx, identity.telegramId);
	if (account) return await signInWithAccount(ctx, account, identity, method);
	const existingUser = await findUserByTelegramId(ctx, identity.telegramId);
	if (existingUser && await hasLinkedTelegramIdentity(ctx, existingUser.id, identity.telegramId)) {
		const committed = await findTelegramAccount(ctx, identity.telegramId);
		if (committed) return await signInWithAccount(ctx, committed, identity, method);
		const accountLinking = ctx.context.options.account?.accountLinking;
		if (accountLinking?.enabled === false || accountLinking?.disableImplicitLinking === true) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
		await assertValidUserInfo(ctx, existingUser, "link-account", method);
		return await withTelegramOperation(ctx, `user:${existingUser.id}`, () => runWithTransaction(ctx.context.adapter, async () => {
			const linked = await internalAdapter.linkAccount(accountData(existingUser.id, identity));
			if (!linked) throw APIError.from("FORBIDDEN", ERROR_CODES.ACCOUNT_CREATION_REJECTED);
			return await refreshIdentity(ctx, existingUser, linked, identity);
		}));
	}
	if (!options.allowCreate) throw APIError.from("NOT_FOUND", options.notFound);
	let email = signUpEmail(options.userData, identity);
	if (await internalAdapter.findUserByEmail(email)) {
		const created = await findTelegramAccount(ctx, identity.telegramId);
		if (created) return await signInWithAccount(ctx, created, identity, method);
		if ((options.userData.email ?? null) !== null) throw APIError.from("UNPROCESSABLE_ENTITY", BASE_ERROR_CODES.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL);
		email = createPlaceholderEmail({
			identifier: `${identity.telegramId}.${randomSuffix()}`,
			namespace: PLUGIN_ID
		});
	}
	try {
		return await createTelegramUser(ctx, options, email);
	} catch (error) {
		const created = isAPIError(error) ? null : await findTelegramAccount(ctx, identity.telegramId);
		if (!created) throw error;
		return await signInWithAccount(ctx, created, identity, method);
	}
}
/** Eight lowercase base-36 characters. */
function randomSuffix() {
	const bytes = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(8));
	return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}
/** A mapper's email, or the placeholder (Better Auth's user.email is required). */
function signUpEmail(userData, identity) {
	return userData.email ?? createPlaceholderEmail({
		identifier: identity.telegramId,
		namespace: "telegram"
	});
}
// src/verify.ts
const encoder = new TextEncoder();
function importHmacKey(key, usage) {
	return globalThis.crypto.subtle.importKey("raw", key, {
		name: "HMAC",
		hash: "SHA-256"
	}, false, [usage]);
}
/**
* Computes HMAC-SHA256 of data using the given key
*/
async function hmacSha256(key, data) {
	return globalThis.crypto.subtle.sign("HMAC", await importHmacKey(key, "sign"), encoder.encode(data));
}
/**
* Computes SHA-256 hash of a string
*/
async function sha256(data) {
	return await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(data));
}
const HEX_SHA256 = /^[0-9a-f]{64}$/u;
/**
* Checks a hex-encoded HMAC-SHA256 in constant time (Web Crypto `verify`).
*/
async function verifyHmacHex(key, data, hexSignature) {
	if (typeof hexSignature !== "string" || !HEX_SHA256.test(hexSignature)) return false;
	const signature = /* @__PURE__ */ new Uint8Array(32);
	for (let i = 0; i < 32; i += 1) signature[i] = Number.parseInt(hexSignature.slice(i * 2, i * 2 + 2), 16);
	return globalThis.crypto.subtle.verify("HMAC", await importHmacKey(key, "verify"), signature, encoder.encode(data));
}
/**
* `auth_date` must be a Unix time no older than `maxAge` and not in the future.
*/
function isFreshAuthDate(authDate, maxAge) {
	if (!Number.isSafeInteger(authDate)) return false;
	const age = Math.floor(Date.now() / 1e3) - authDate;
	return age <= maxAge && age >= -60;
}
/** Code-unit order, as Telegram's "sorted alphabetically" check string uses. */
function byKey([a], [b]) {
	if (a < b) return -1;
	return a > b ? 1 : 0;
}
/**
* Verifies the authenticity of Telegram authentication data
* @param data - Authentication data from Telegram Login Widget
* @param botToken - Bot token from @BotFather
* @param maxAge - Maximum age of auth in seconds (default: 24 hours)
* @returns Promise that resolves to true if data is valid, false otherwise
*/
async function verifyTelegramAuth(data, botToken, maxAge = DEFAULT_MAX_AUTH_AGE) {
	const { hash, ...dataWithoutHash } = data;
	if (!isFreshAuthDate(dataWithoutHash.auth_date, maxAge)) return false;
	const entries = Object.entries(dataWithoutHash).map(([key, value]) => [key, String(value)]);
	if (entries.some(([key, value]) => key.includes("\n") || value.includes("\n"))) return false;
	const dataCheckString = entries.sort(byKey).map(([key, value]) => `${key}=${value}`).join("\n");
	return verifyHmacHex(new Uint8Array(await sha256(botToken)), dataCheckString, hash);
}
/**
* Verifies Login Widget data against any of `botTokens` and returns the token
* that signed it, or `null`. Tokens are tried in order; duplicates are
* ignored. The algorithm and freshness check are the same as
* {@link verifyTelegramAuth}.
*/
async function verifyTelegramAuthAny(data, botTokens, maxAge = DEFAULT_MAX_AUTH_AGE) {
	for (const botToken of new Set(botTokens.filter(Boolean))) if (await verifyTelegramAuth(data, botToken, maxAge)) return botToken;
	return null;
}
/** Reject identities that JSON numbers cannot represent without changing them. */
function isTelegramUserId(id) {
	return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}
/**
* Validates that required fields are present in Telegram auth data
*/
function validateTelegramAuthData(data) {
	return typeof data === "object" && data !== null && isTelegramUserId(data.id) && typeof data.first_name === "string" && typeof data.auth_date === "number" && typeof data.hash === "string";
}
/**
* Parse initData string from Telegram Mini App
* @param initData - URL-encoded initData string from Telegram.WebApp.initData
* @returns Parsed Mini App data object
*/
function parseMiniAppInitData(initData) {
	const params = new URLSearchParams(initData);
	const data = {};
	for (const [key, value] of params.entries()) if (key === "user" || key === "receiver" || key === "chat") try {
		data[key] = JSON.parse(value);
	} catch {}
	else if (key === "auth_date" || key === "can_send_after") data[key] = Number(value);
	else data[key] = value;
	return data;
}
/**
* Verifies the authenticity of Telegram Mini App initData
* @param initData - Raw initData string from Telegram.WebApp.initData
* @param botToken - Bot token from @BotFather
* @param maxAge - Maximum age of auth in seconds (default: 24 hours)
* @returns Promise that resolves to true if data is valid, false otherwise
*/
async function verifyMiniAppInitData(initData, botToken, maxAge = DEFAULT_MAX_AUTH_AGE) {
	const params = new URLSearchParams(initData);
	if (new Set(params.keys()).size !== params.size) return false;
	const hash = params.get("hash");
	if (!hash) return false;
	params.delete("hash");
	const authDate = params.get("auth_date");
	if (!(authDate && isFreshAuthDate(Number(authDate), maxAge))) return false;
	const dataCheckString = Array.from(params.entries()).sort(byKey).map(([key, value]) => `${key}=${value}`).join("\n");
	return verifyHmacHex(new Uint8Array(await hmacSha256(encoder.encode("WebAppData"), botToken)), dataCheckString, hash);
}
/**
* Verifies Mini App initData against any of `botTokens` and returns the token
* that signed it, or `null`. Tokens are tried in order; duplicates are
* ignored. The algorithm and freshness check are the same as
* {@link verifyMiniAppInitData}.
*/
async function verifyMiniAppInitDataAny(initData, botTokens, maxAge = DEFAULT_MAX_AUTH_AGE) {
	for (const botToken of new Set(botTokens.filter(Boolean))) if (await verifyMiniAppInitData(initData, botToken, maxAge)) return botToken;
	return null;
}
/**
* Validates that required fields are present in Mini App data
*/
function validateMiniAppData(data) {
	return typeof data === "object" && data !== null && typeof data.auth_date === "number" && typeof data.hash === "string" && (data.user === void 0 || typeof data.user === "object" && data.user !== null && isTelegramUserId(data.user.id) && typeof data.user.first_name === "string");
}
// src/miniapp-endpoints.ts
function readInitData(body) {
	const initData = body?.initData;
	if (!initData || typeof initData !== "string") throw APIError.from("BAD_REQUEST", ERROR_CODES.INIT_DATA_REQUIRED);
	return initData;
}
/** Every configured bot token; HMAC data can come from any of them. */
function botTokens$1(config) {
	return config.bots.map((bot) => bot.token).filter(Boolean);
}
function requireBotTokens(config) {
	const tokens = botTokens$1(config);
	if (tokens.length === 0) throw APIError.from("INTERNAL_SERVER_ERROR", ERROR_CODES.BOT_TOKEN_REQUIRED);
	return tokens;
}
/**
* Creates the Mini App endpoints: signIn, validate.
*/
function createMiniAppEndpoints(config) {
	return {
		signInWithMiniApp: createAuthEndpoint("/telegram/miniapp/signin", {
			method: "POST",
			use: [formCsrfMiddleware]
		}, async (ctx) => {
			const initData = readInitData(ctx.body);
			if (config.miniAppValidateInitData && !await verifyMiniAppInitDataAny(initData, requireBotTokens(config), config.maxAuthAge)) throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_MINI_APP_INIT_DATA);
			const data = parseMiniAppInitData(initData);
			if (!validateMiniAppData(data)) throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_MINI_APP_DATA_STRUCTURE);
			if (!data.user) throw APIError.from("BAD_REQUEST", ERROR_CODES.NO_USER_IN_INIT_DATA);
			const miniAppUser = data.user;
			return startSession(ctx, await findOrCreateTelegramUser(ctx, {
				identity: {
					telegramId: String(miniAppUser.id),
					username: miniAppUser.username
				},
				userData: {
					name: miniAppUser.last_name ? `${miniAppUser.first_name} ${miniAppUser.last_name}` : miniAppUser.first_name,
					image: miniAppUser.photo_url,
					...await config.mapMiniAppDataToUser?.(miniAppUser)
				},
				allowCreate: config.autoCreateUser && config.miniAppAllowAutoSignin,
				method: "telegram-mini-app",
				notFound: ERROR_CODES.MINI_APP_AUTO_SIGNIN_DISABLED
			}));
		}),
		validateMiniApp: createAuthEndpoint("/telegram/miniapp/validate", { method: "POST" }, async (ctx) => {
			const initData = readInitData(ctx.body);
			const matched = await verifyMiniAppInitDataAny(initData, requireBotTokens(config), config.maxAuthAge);
			if (!matched) return ctx.json({
				valid: false,
				data: null
			});
			return ctx.json({
				valid: true,
				data: parseMiniAppInitData(initData),
				botId: matched.split(":")[0] || void 0
			});
		})
	};
}
/**
* Rate limit rules for Mini App endpoints.
*/
function getMiniAppRateLimits() {
	return [{
		pathMatcher: (path) => path === "/telegram/miniapp/signin",
		window: 60,
		max: 10
	}, {
		pathMatcher: (path) => path === "/telegram/miniapp/validate",
		window: 60,
		max: 20
	}];
}
// src/oidc-token.ts
/**
* Algorithms Telegram can sign ID tokens with that Web Crypto can verify.
* ES256K (secp256k1) is offered by @BotFather but has no Web Crypto support.
*/
const SUPPORTED_SIGNING_ALGORITHMS = [
	"RS256",
	"ES256",
	"EdDSA"
];
/** Matches Better Auth's own ID token verifier. */
const ID_TOKEN_CLOCK_TOLERANCE_SECONDS = 30;
const ID_TOKEN_REQUIRED_CLAIMS = [
	"iss",
	"sub",
	"aud",
	"exp",
	"iat"
];
/** Telegram documents a number but also sends strings; mappers always get strings. */
function normalizeTelegramId(id) {
	if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return String(id);
	if (typeof id === "string" && /^[1-9][0-9]*$/u.test(id)) return id;
	throw new Error("ID token has an invalid Telegram user id");
}
/** One verifier per provider keeps both sign-in paths on the same JWKS cache and checks. */
function createTelegramIdTokenVerifier(clientId) {
	const jwks = createRemoteJWKSet(new URL(TELEGRAM_OIDC_JWKS_URI));
	return async (token, expectedNonce) => {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: TELEGRAM_OIDC_ISSUER,
			audience: clientId,
			algorithms: SUPPORTED_SIGNING_ALGORITHMS,
			requiredClaims: ID_TOKEN_REQUIRED_CLAIMS,
			clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_SECONDS
		});
		if (typeof payload.sub !== "string" || !payload.sub.trim()) throw new Error("ID token has no subject");
		if ([payload.aud].flat().some((audience) => audience !== clientId)) throw new Error("ID token is also issued to another audience");
		payload.aud = clientId;
		if (expectedNonce !== void 0 && payload.nonce !== expectedNonce) throw new Error("ID token nonce does not match the authorization request");
		if (payload.id !== void 0) payload.id = normalizeTelegramId(payload.id);
		return payload;
	};
}
// src/telegram-placeholder.ts
function oidcEmail(identifier) {
	return createPlaceholderEmail({
		identifier,
		namespace: TELEGRAM_OIDC_PROVIDER_ID
	});
}
function directOIDCEmail(sub) {
	if (sub.length > 64) return null;
	try {
		return oidcEmail(sub);
	} catch {
		return null;
	}
}
async function opaqueSubjectKey(sub) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub));
	return `h-${Array.from(new Uint8Array(digest).slice(0, 24), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function matchesIdentifier(identifier, base) {
	const lower = base.toLowerCase();
	return identifier === lower || identifier.startsWith(`${lower}.`);
}
/**
* `<identifier>@<namespace>.placeholder.invalid` addresses are the plugin's.
* Returns the identifier when `email` is one of them.
*/
function placeholderIdentifier(email) {
	if (typeof email !== "string") return null;
	const lower = email.toLowerCase();
	for (const [namespace, domain] of Object.entries(PLACEHOLDER_EMAIL_DOMAINS)) if (lower.endsWith(`@${domain}`)) return {
		identifier: lower.slice(0, -domain.length - 1),
		namespace
	};
	return null;
}
/**
* Only the Telegram flows may create users with Telegram placeholder emails:
* otherwise anyone could register `<telegramId>@telegram.placeholder.invalid`
* with a password and block (or pre-claim) that Telegram user's account.
*/
async function isAllowedPlaceholder(user) {
	const placeholder = placeholderIdentifier(user.email);
	if (!placeholder) return true;
	if (placeholder.namespace === "telegram") {
		const telegramId = String(user.telegramId ?? "");
		return telegramId !== "" && (placeholder.identifier === telegramId || placeholder.identifier.startsWith(`${telegramId}.`));
	}
	const subject = (await currentClaims())?.sub;
	if (subject === void 0) return false;
	if (directOIDCEmail(subject) && matchesIdentifier(placeholder.identifier, subject)) return true;
	return matchesIdentifier(placeholder.identifier, await opaqueSubjectKey(subject));
}
/** Keep placeholder selection and reservation together so emails never prove identity. */
async function oidcPlaceholderEmail(sub, providerId = TELEGRAM_OIDC_PROVIDER_ID) {
	const direct = directOIDCEmail(sub);
	const identifier = direct ? sub : await opaqueSubjectKey(sub);
	const email = direct ?? oidcEmail(identifier);
	const ctx = tryGetCurrentAuthEndpointContext()?.context;
	if (!ctx) return email;
	if (await (await getCurrentAdapter(ctx.adapter)).findOne({
		model: "account",
		where: [{
			field: "providerId",
			value: providerId
		}, {
			field: "accountId",
			value: sub
		}]
	})) return email;
	if (await ctx.internalAdapter.findUserByEmail(email)) {
		const suffix = crypto.randomUUID();
		if (identifier.length + suffix.length + 1 <= 64) return oidcEmail(`${identifier}.${suffix}`);
		return oidcEmail(`${direct ? await opaqueSubjectKey(sub) : identifier}.${suffix.replaceAll("-", "").slice(0, 13)}`);
	}
	return email;
}
// src/telegram-profile.ts
/** Stored and mapped values compared as the database would store them. */
function sameValue(stored, mapped) {
	if (stored instanceof Date || mapped instanceof Date) return stored !== null && stored !== void 0 && mapped !== null && mapped !== void 0 && new Date(stored).getTime() === new Date(mapped).getTime();
	if (typeof stored === "object" && typeof mapped === "object") return JSON.stringify(stored) === JSON.stringify(mapped);
	return stored === mapped;
}
/**
* `oidc.updateUserInfoOnSignIn`: writes the profile from this sign-in
* (name, image, mapped fields) onto the user, like Better Auth's
* `overrideUserInfoOnSignIn` but never the email. Runs once Better Auth has
* allowed the sign-in; a refused update leaves the stored profile, as
* Better Auth's own profile updates do.
*/
async function updateUserInfo(ctx, userId, userInfo) {
	const { id: _id, email: _email, emailVerified: _emailVerified, name, image, ...profile } = userInfo;
	const user = await ctx.internalAdapter.findUserById(userId);
	if (!user) return;
	try {
		const changes = Object.fromEntries(Object.entries({
			name,
			image,
			...parseAdditionalUserInputFromProviderProfile(ctx.options, profile, "update")
		}).filter(([key, value]) => value !== void 0 && !sameValue(user[key], value)));
		if (Object.keys(changes).length === 0) return;
		if (!await ctx.internalAdapter.updateUser(userId, changes)) throw new Error("a database hook refused the update");
		await markChanged(userId);
	} catch (error) {
		ctx.logger.warn("[better-auth-telegram] OIDC: could not update the user's profile on sign-in.", error);
	}
}
// src/telegram-identity-session.ts
/** The response headers queued so far, as Better Auth's own cookie helpers see them. */
function pendingHeaders(ctx) {
	return new Set([ctx.responseHeaders, ctx.context.responseHeaders].filter((headers) => headers !== void 0));
}
/**
* Whether the response still sets the session token cookie to `token`; an
* earlier after hook may have expired it to end the session.
*/
function setsSessionToken(ctx, name, token) {
	const last = [...pendingHeaders(ctx)].flatMap((headers) => headers.getSetCookie()).filter((cookie) => cookie.startsWith(`${name}=`)).at(-1);
	if (!last || /;\s*max-age=0(?:;|$)/iu.test(last)) return false;
	const value = last.slice(name.length + 1).split(";")[0] ?? "";
	return decodeURIComponent(value).startsWith(`${token}.`);
}
/** Drops `Set-Cookie` entries for these cookies (and their chunks) queued so far. */
function dropPendingCookies(ctx, names) {
	const isNamed = (cookie) => names.some((name) => cookie.startsWith(`${name}=`) || cookie.startsWith(`${name}.`));
	for (const headers of pendingHeaders(ctx)) {
		const cookies = headers.getSetCookie();
		if (cookies.some(isNamed)) {
			headers.delete("set-cookie");
			for (const cookie of cookies.filter((entry) => !isNamed(entry))) headers.append("set-cookie", cookie);
		}
	}
}
/**
* Better Auth issues a session with the user it read before the hooks above
* ran. When they changed that user, this after hook issues the session
* cookie (and `newSession`, and the user in an ID token sign-in response)
* again with the user as stored now, like Better Auth's /update-user;
* otherwise `session.cookieCache` would serve the old values until it
* expires, and in stateless mode until the next sign-in.
*/
const refreshSessionAfterOIDC = {
	matcher: () => true,
	handler: createAuthMiddleware(async (ctx) => {
		const signIn = await currentSignIn();
		const issued = ctx.context.newSession;
		if (!(signIn && issued && signIn.changedUserIds.has(issued.user.id))) return;
		const user = await ctx.context.internalAdapter.findUserById(issued.user.id);
		if (!user) return;
		const { sessionToken, sessionData, dontRememberToken } = ctx.context.authCookies;
		if (!setsSessionToken(ctx, sessionToken.name, issued.session.token)) return;
		dropPendingCookies(ctx, [
			sessionToken.name,
			sessionData.name,
			dontRememberToken.name
		]);
		await setSessionCookie(ctx, {
			session: issued.session,
			user
		});
		const returned = ctx.context.returned;
		if (returned && typeof returned === "object" && !(returned instanceof Error) && !(returned instanceof Response) && returned.user?.id === user.id) return ctx.json({
			...returned,
			user: parseUserOutput(ctx.context.options, user)
		});
	})
};
// src/telegram-identity.ts
function telegramIdentityHooks(ctx, options) {
	const placeholderGuard = { user: {
		create: { async before(user) {
			if (!await isAllowedPlaceholder(user)) {
				ctx.logger.warn("[better-auth-telegram] Refused to create a user with a Telegram placeholder email outside the Telegram flows.");
				return false;
			}
		} },
		update: { async before(data) {
			if (!await isAllowedPlaceholder(data)) throw APIError.from("BAD_REQUEST", ERROR_CODES.PLACEHOLDER_EMAIL_RESERVED);
		} }
	} };
	const sessionHooks = { create: { async before(session) {
		const signIn = await currentSignIn();
		if (!signIn) return;
		const account = await accountProvenByClaims(ctx, session.userId, signIn.claims, signIn.providerId);
		if (account && options.identityFields) await syncTelegramIdentity(ctx, session.userId, signIn.claims, account);
		if (account && options.updateUserInfo) await updateUserInfo(ctx, session.userId, signIn.userInfo);
		if (signIn.expectedUserId === session.userId && !await accountProvenByClaims(ctx, session.userId, signIn.claims, signIn.providerId)) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
	} } };
	return {
		...placeholderGuard,
		session: sessionHooks,
		account: {
			create: {
				async before(account) {
					const signIn = await currentSignIn();
					if (signIn && isOIDCProvider(ctx, account.providerId) && account.providerId === signIn.providerId && account.accountId === signIn.claims.sub) signIn.expectedUserId ??= account.userId;
				},
				async after(account) {
					if (!isOIDCProvider(ctx, account.providerId)) return;
					const signIn = await currentSignIn();
					if (signIn && account.providerId === signIn.providerId && account.accountId === signIn.claims.sub) {
						if (signIn.expectedUserId !== account.userId) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
						if (options.identityFields) await syncTelegramIdentity(ctx, account.userId, signIn.claims, account);
					}
				}
			},
			delete: { async after(account) {
				if (options.identityFields && isTelegramProvider(ctx, account.providerId)) await reconcileTelegramIdentity(ctx, account.userId);
			} }
		}
	};
}
// src/oidc.ts
const LOG_PREFIX = "[better-auth-telegram] OIDC:";
/**
* The scopes to request, each once. Like Better Auth's own providers,
* `scopes` adds to the defaults (`openid`, `profile`) and
* `disableDefaultScope` drops `profile`; `openid` is always sent, Telegram
* requires it.
*/
function buildScopes(options, requestScopes = []) {
	const scopes = /* @__PURE__ */ new Set(["openid"]);
	if (!options.disableDefaultScope) scopes.add("profile");
	for (const scope of [...options.scopes ?? [], ...requestScopes]) scopes.add(scope);
	if (options.requestPhone) scopes.add("phone");
	if (options.requestBotAccess) scopes.add("telegram:bot_access");
	return Array.from(scopes);
}
function displayName(claims) {
	if (claims.name) return claims.name;
	return [claims.given_name, claims.family_name].filter(Boolean).join(" ") || claims.preferred_username;
}
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
function createTelegramOIDCProvider(botToken, options = {}, logger = console, providerId = TELEGRAM_OIDC_PROVIDER_ID) {
	const botId = botToken.split(":")[0];
	const clientId = options.clientId || botId;
	const clientSecret = options.clientSecret ?? "";
	const providerOptions = {
		clientId,
		clientSecret,
		disableIdTokenSignIn: options.disableIdTokenSignIn,
		disableSignUp: options.disableSignUp
	};
	const requireOIDCCredentials = () => {
		if (!clientId) throw APIError$1.from("INTERNAL_SERVER_ERROR", TELEGRAM_ERROR_CODES.OIDC_CLIENT_ID_REQUIRED);
		if (!clientSecret) throw APIError$1.from("INTERNAL_SERVER_ERROR", TELEGRAM_ERROR_CODES.OIDC_CLIENT_SECRET_REQUIRED);
	};
	const verifyIdToken = createTelegramIdTokenVerifier(clientId);
	return {
		id: providerId,
		name: "Telegram",
		issuer: TELEGRAM_OIDC_ISSUER,
		requiresIdTokenNonce: true,
		idToken: { async verify(token, nonce) {
			if (!nonce) return false;
			try {
				await verifyIdToken(token, nonce);
				return true;
			} catch {
				return false;
			}
		} },
		accountSubject({ profile }) {
			if (typeof profile.sub !== "string" || !profile.sub.trim()) throw new Error(`${LOG_PREFIX} ID token has no subject`);
			return profile.sub;
		},
		createAuthorizationURL({ state, codeVerifier, scopes, redirectURI, idTokenNonce }) {
			requireOIDCCredentials();
			const _scopes = buildScopes(options, scopes);
			return createAuthorizationURL({
				id: providerId,
				options: providerOptions,
				authorizationEndpoint: TELEGRAM_OIDC_AUTH_ENDPOINT,
				scopes: _scopes,
				state,
				codeVerifier,
				redirectURI,
				nonce: idTokenNonce
			});
		},
		async validateAuthorizationCode({ code, codeVerifier, redirectURI }) {
			requireOIDCCredentials();
			const tokens = await validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI,
				options: providerOptions,
				tokenEndpoint: TELEGRAM_OIDC_TOKEN_ENDPOINT,
				authentication: "basic"
			});
			const error = tokens.raw?.error;
			if (error) throw new Error(`${LOG_PREFIX} token endpoint returned "${String(error)}"`);
			return tokens;
		},
		async getUserInfo(token) {
			if (!token.idToken) {
				logger.warn(`${LOG_PREFIX} getUserInfo: no id_token in the token response.`);
				return null;
			}
			let claims;
			try {
				claims = await verifyIdToken(token.idToken, token.expectedIdTokenNonce);
			} catch (error) {
				logger.warn(`${LOG_PREFIX} getUserInfo: rejected id_token.`, error instanceof Error ? error.message : error);
				return null;
			}
			if (claims.id === void 0) logger.warn(`${LOG_PREFIX} the ID token has no profile claims (id, name, username).`, options.disableDefaultScope ? "oidc.disableDefaultScope is set, so the profile scope isn't requested." : "Telegram drops them for bots that sign with EdDSA or ES256K; use RS256 or ES256 in @BotFather (Login Widget > Advanced).");
			const { id: _id, emailVerified: _emailVerified, ...mapped } = await options.mapOIDCProfileToUser?.(claims) ?? {};
			const user = {
				name: displayName(claims),
				image: claims.picture,
				email: await oidcPlaceholderEmail(claims.sub, providerId),
				...mapped,
				emailVerified: false
			};
			await rememberVerifiedClaims(claims, user, providerId);
			return {
				user,
				data: claims
			};
		},
		options: providerOptions
	};
}
// src/oidc-linking-policy.ts
/** Only a surviving linked account can authorize another Telegram login. */
async function findProvenTelegramUser(ctx, telegramId) {
	const users = await (await getCurrentAdapter(ctx.context.adapter)).findMany({
		model: "user",
		where: [{
			field: "telegramId",
			value: telegramId
		}],
		limit: 2
	});
	if (users.length > 1) throw APIError.from("CONFLICT", ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
	const [user] = users;
	if (!user) return null;
	return (await ctx.context.internalAdapter.findAccounts(user.id)).some((account) => account.providerId === "telegram" && account.accountId === telegramId || isOIDCProvider(ctx.context, account.providerId) && account.telegramId === telegramId) ? user : null;
}
async function validateTelegramOIDCLink(ctx, user, claims, profile, providerId) {
	const validate = ctx.context.options.user?.validateUserInfo;
	if (!validate) return;
	for (const action of ["link-account", "sign-in"]) {
		let result;
		try {
			result = await validate({
				user: {
					...profile,
					id: user.id,
					email: typeof profile.email === "string" ? profile.email.toLowerCase() : void 0
				},
				source: {
					method: "oauth",
					action,
					oauth: {
						providerId,
						profile: { ...claims }
					}
				}
			}, ctx);
		} catch (error) {
			ctx.context.logger.error("validateUserInfo callback threw", error);
			throw new APIError("FORBIDDEN", {
				code: "validation_failed",
				message: "User validation failed",
				cause: error
			});
		}
		if (result?.error) throw new APIError("FORBIDDEN", {
			code: result.error,
			message: result.errorDescription || result.error
		});
	}
}
// src/oidc-linking.ts
async function linkVerifiedIdentity(ctx, claims, profile, tokens, providerId) {
	const telegramId = claims.id;
	if (!telegramId) return;
	const key = {
		providerId,
		accountId: claims.sub
	};
	await withTelegramOperation(ctx, `oidc:${claims.sub}`, async () => {
		const hasBinding = async () => (await getCurrentAdapter(ctx.context.adapter)).findOne({
			model: "account",
			where: [{
				field: "providerId",
				value: key.providerId
			}, {
				field: "accountId",
				value: key.accountId
			}]
		});
		if (await hasBinding()) return;
		const user = await findProvenTelegramUser(ctx, telegramId);
		if (!user) return;
		const linking = ctx.context.options.account?.accountLinking;
		if (linking?.enabled === false || linking?.disableImplicitLinking === true) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
		await withTelegramOperation(ctx, `user:${user.id}`, async () => {
			await validateTelegramOIDCLink(ctx, user, claims, profile, providerId);
			const guarded = {
				...ctx.context.adapter,
				transaction: (task) => ctx.context.adapter.transaction((adapter) => task({
					...adapter,
					create: async (data) => {
						if (data.model === "account" && (data.data.providerId !== key.providerId || data.data.accountId !== key.accountId || data.data.userId !== user.id)) throw APIError.from("CONFLICT", ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
						if (data.model === "account" && (await findProvenTelegramUser(ctx, telegramId))?.id !== user.id) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
						return adapter.create(data);
					}
				}))
			};
			await runWithTransaction(guarded, async () => {
				if (await hasBinding()) return;
				if ((await findProvenTelegramUser(ctx, telegramId))?.id !== user.id) throw APIError.from("UNAUTHORIZED", ERROR_CODES.ACCOUNT_NOT_LINKED);
				const linked = await ctx.context.internalAdapter.linkAccount({
					...key,
					userId: user.id,
					accessToken: await setTokenUtil(tokens.accessToken, ctx.context),
					refreshToken: await setTokenUtil(tokens.refreshToken, ctx.context),
					idToken: tokens.idToken,
					accessTokenExpiresAt: tokens.accessTokenExpiresAt,
					refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
					scope: tokens.scopes?.join(",")
				});
				if (!linked) throw APIError.from("FORBIDDEN", ERROR_CODES.ACCOUNT_CREATION_REJECTED);
				if (linked.userId !== user.id || linked.accountId !== key.accountId || linked.providerId !== key.providerId) throw APIError.from("CONFLICT", ERROR_CODES.TELEGRAM_ALREADY_LINKED_OTHER);
				await applyUpdateUserInfoOnLink(ctx, user.id, profile);
			});
		});
	});
}
/**
* Complete cross-flow identity matching after token verification and mapping,
* before Better Auth's ordinary account lookup. Existing OIDC bindings win;
* explicit linkSocial and account-info requests retain their native behavior.
*/
function withTelegramIdentityLinking(provider, identityFields) {
	return {
		...provider,
		async getUserInfo(tokens) {
			const result = await provider.getUserInfo(tokens);
			const current = tryGetCurrentAuthEndpointContext();
			if (!(result && current)) return result;
			const isCallback = current.path === "/callback/:id" && current.params?.id === provider.id;
			const isTokenSignIn = current.path === "/sign-in/social" && current.body?.provider === provider.id && !!current.body?.idToken;
			if (isCallback && !(await getOAuthState())?.link || isTokenSignIn) {
				if (identityFields) await linkVerifiedIdentity(current, result.data, result.user, tokens, provider.id);
				const signIn = await currentSignIn();
				if (signIn) {
					const accounts = await (await getCurrentAdapter(current.context.adapter)).findMany({
						model: "account",
						where: [{
							field: "providerId",
							value: provider.id
						}, {
							field: "accountId",
							value: result.data.sub
						}],
						limit: 2
					});
					signIn.expectedUserId ??= accounts.length === 1 ? accounts[0].userId : void 0;
				}
			}
			return result;
		}
	};
}
// src/bot-config.ts
/** The bot that keeps the legacy `telegram-oidc` provider id. */
const DEFAULT_BOT_KEY = "default";
/** `<bot id>:<secret>`, e.g. "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw". */
const BOT_TOKEN_SHAPE$1 = /^\d+:[\w-]+$/u;
const BOT_KEY_SHAPE = /^[a-z0-9-]+$/u;
function botId(token) {
	return token.split(":")[0] ?? "";
}
function oidcProviderId(key, oidc) {
	if (key === "default") return TELEGRAM_OIDC_PROVIDER_ID;
	return oidc.providerId || `telegram-oidc-${key}`;
}
function normalizeDeclaredBot(definition, seenKeys, warn) {
	const key = typeof definition.key === "string" ? definition.key : "";
	if (!BOT_KEY_SHAPE.test(key)) throw new Error(`[better-auth-telegram] Invalid bot key ${JSON.stringify(key)}. Keys must match ^[a-z0-9-]+$ (lowercase letters, digits and hyphens).`);
	if (seenKeys.has(key)) throw new Error(`[better-auth-telegram] Duplicate bot key "${key}". Each bots[] entry needs a unique key.`);
	seenKeys.add(key);
	const rawToken = typeof definition.token === "string" ? definition.token : "";
	const token = rawToken.trim();
	if (token !== rawToken) warn(`Bot "${key}": removed whitespace around the token. Telegram tokens contain none; check how the value is loaded (a trailing newline in an env file makes every signature check fail).`);
	if (token && !BOT_TOKEN_SHAPE$1.test(token)) warn(`Bot "${key}": the token doesn't look like a bot token from @BotFather ("<bot id>:<secret>"). Login Widget and Mini App signatures won't verify with it.`);
	const rawUsername = definition.username ?? "";
	const username = rawUsername.replace(/^@/u, "");
	if (username !== rawUsername) warn(`Bot "${key}": username "${rawUsername}" starts with "@"; using "${username}". The Login Widget wants the bare username.`);
	return {
		key,
		token,
		username,
		oidc: definition.oidc,
		declared: true
	};
}
function resolveOIDC(bot, options) {
	const global = options.oidc;
	const perBot = bot.oidc;
	const inherited = !perBot && bot.key === "default" && (!options.bots || global?.clientId !== void 0 || global?.clientSecret) ? {
		clientId: global?.clientId,
		clientSecret: global?.clientSecret
	} : void 0;
	const configured = perBot ?? inherited;
	if (!(options.oidcEnabled && configured)) return {
		key: bot.key,
		token: bot.token,
		username: bot.username
	};
	return {
		key: bot.key,
		token: bot.token,
		username: bot.username,
		oidcProviderId: oidcProviderId(bot.key, configured),
		oidc: {
			clientId: configured.clientId || botId(bot.token),
			clientSecret: configured.clientSecret ?? ""
		}
	};
}
function warnOIDCCredentials(bots, legacy, warn) {
	for (const bot of bots) {
		if (!(bot.oidcProviderId && bot.oidc)) continue;
		const prefix = legacy ? "" : `Bot "${bot.key}": `;
		if (!(bot.oidc.clientId || bot.token)) warn(`${prefix}OIDC: clientId is required. Configure oidc.clientId or botToken before starting an OIDC login.`);
		if (!bot.oidc.clientSecret) warn(`${prefix}OIDC: clientSecret is required. Configure oidc.clientSecret (the Client Secret shown in @BotFather > your bot > Login Widget) before starting an OIDC login.`);
	}
}
function warnSharedWidgetAndOIDC(bots, legacy, warn) {
	for (const bot of bots) {
		if (bot.oidc?.clientId && bot.token && bot.oidc.clientId !== botId(bot.token)) continue;
		if (!bot.oidcProviderId) continue;
		warn(`${legacy ? "" : `Bot "${bot.key}": `}Login Widget and OIDC are both enabled on the same bot. Switching a bot to OpenID Connect in @BotFather permanently disables its legacy Login Widget; use a second bot for OIDC or set loginWidget: false.`);
	}
}
/**
* Normalizes `bots[]` and the legacy `botToken`/`botUsername` pair, applies
* OIDC defaults and verifies that bot keys and provider ids are unique.
*
* Structural mistakes (invalid or duplicate keys, duplicate provider ids)
* throw a plain `Error`; suspicious values only warn, as before.
*/
function resolveBots(options, warn) {
	const declared = Array.isArray(options.bots);
	const seenKeys = /* @__PURE__ */ new Set();
	const inputs = declared ? options.bots.map((bot) => normalizeDeclaredBot(bot, seenKeys, warn)) : [{
		key: DEFAULT_BOT_KEY,
		token: options.botToken,
		username: options.botUsername,
		declared: false
	}];
	if (declared && !seenKeys.has("default") && (options.botToken || options.botUsername || inputs.length === 0)) inputs.unshift({
		key: DEFAULT_BOT_KEY,
		token: options.botToken,
		username: options.botUsername,
		declared: false
	});
	if (inputs.length === 0) inputs.push({
		key: DEFAULT_BOT_KEY,
		token: "",
		username: "",
		declared: false
	});
	const tokens = /* @__PURE__ */ new Map();
	for (const bot of inputs) {
		if (!bot.token) continue;
		const other = tokens.get(bot.token);
		if (other) warn(`Bot keys "${other}" and "${bot.key}" use the same token. Only use one token for several bots if they really are the same Telegram bot.`);
		else tokens.set(bot.token, bot.key);
	}
	if (declared) for (const bot of inputs) {
		if (options.hmacFlow && !bot.token) warn(`Bot "${bot.key}": ${ERROR_CODES.BOT_TOKEN_REQUIRED.message}. The enabled HMAC flow will reject its requests until it is configured.`);
		if (options.widgetEnabled && !bot.username) warn(`Bot "${bot.key}": ${ERROR_CODES.BOT_USERNAME_REQUIRED.message}. Its Login Widget cannot be rendered until it is configured.`);
	}
	else {
		const [bot] = inputs;
		if (options.hmacFlow && !bot?.token) warn(`${ERROR_CODES.BOT_TOKEN_REQUIRED.message}. The enabled HMAC flow will reject requests until it is configured.`);
		if (options.widgetEnabled && !bot?.username) warn(`${ERROR_CODES.BOT_USERNAME_REQUIRED.message}. The Login Widget cannot be rendered until it is configured.`);
	}
	const bots = inputs.map((bot) => resolveOIDC(bot, options));
	warnOIDCCredentials(bots, !declared, warn);
	if (options.widgetEnabled && options.oidcEnabled) warnSharedWidgetAndOIDC(bots, !declared, warn);
	const providerIds = bots.flatMap((bot) => bot.oidcProviderId ? [bot.oidcProviderId] : []);
	const duplicate = providerIds.find((providerId, index) => providerIds.indexOf(providerId) !== index);
	if (duplicate) throw new Error(`[better-auth-telegram] Duplicate OIDC provider id "${duplicate}". Set bots[].oidc.providerId to a unique value.`);
	return {
		bots,
		botToken: bots[0]?.token ?? "",
		botUsername: bots[0]?.username ?? "",
		oidcProviderIds: providerIds
	};
}
// src/plugin-config.ts
/** `<bot id>:<secret>`, e.g. "110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw". */
const BOT_TOKEN_SHAPE = /^\d+:[\w-]+$/u;
/**
* Parses `TelegramPluginOptions`, applies defaults, and collects warnings
* about missing or suspicious configuration (logged by the plugin's `init`
* through Better Auth's logger). Structural mistakes such as duplicate bot
* keys or provider ids throw a plain `Error`.
*/
function createPluginConfig(options) {
	const { botToken, botUsername, allowUserToLink = true, autoCreateUser = true, loginWidget, maxAuthAge = DEFAULT_MAX_AUTH_AGE, mapTelegramDataToUser, miniApp, oidc, testMode = false } = options;
	const widgetEnabled = loginWidget !== false;
	const miniAppEnabled = miniApp?.enabled ?? false;
	const oidcEnabled = oidc?.enabled ?? false;
	const identityColumns = widgetEnabled || miniAppEnabled;
	const warnings = [];
	const warn = (message) => warnings.push(`[better-auth-telegram] ${message}`);
	const resolvedBotToken = (botToken ?? "").trim();
	if (resolvedBotToken !== (botToken ?? "")) warn("Removed whitespace around botToken. Telegram tokens contain none; check how the value is loaded (a trailing newline in an env file makes every signature check fail).");
	if (resolvedBotToken && !BOT_TOKEN_SHAPE.test(resolvedBotToken)) warn("botToken doesn't look like a bot token from @BotFather (\"<bot id>:<secret>\", e.g. \"110201543:AAHdqTcv...\"). Login Widget and Mini App signatures won't verify with it.");
	const resolvedBotUsername = (botUsername ?? "").replace(/^@/u, "");
	if (resolvedBotUsername !== (botUsername ?? "")) warn(`botUsername "${botUsername}" starts with "@"; using "${resolvedBotUsername}". The Login Widget wants the bare username.`);
	const hmacFlow = widgetEnabled || miniAppEnabled && miniApp?.validateInitData !== false;
	const resolved = resolveBots({
		botToken: resolvedBotToken,
		botUsername: resolvedBotUsername,
		bots: options.bots,
		hmacFlow,
		oidc,
		oidcEnabled,
		widgetEnabled
	}, warn);
	if (miniAppEnabled && miniApp?.validateInitData === false) warn("miniApp.validateInitData is false: Mini App sign-in accepts unsigned initData, so anyone can sign in as any Telegram user. Never use this in production.");
	if (oidcEnabled && oidc?.requestPhone && !identityColumns) warn("OIDC: requestPhone is set, but with the Login Widget and Mini App off there is no telegramPhoneNumber column, so the phone number is not stored. Enable the Mini App (or the Login Widget) to get the Telegram columns, or read phone_number from mapOIDCProfileToUser into your own field.");
	const { overrideUserInfoOnSignIn } = oidc ?? {};
	if (overrideUserInfoOnSignIn) warn("OIDC: overrideUserInfoOnSignIn is not supported and is ignored (it would write the placeholder email over a real one). Use oidc.updateUserInfoOnSignIn to update returning users' profile without touching their email.");
	if (testMode && oidcEnabled) warn("testMode is enabled with OIDC. Telegram's OIDC endpoint (oauth.telegram.org) has no documented test variant — OIDC authentication may not work with test server bot tokens.");
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
		warnings
	};
}
// src/schema.ts
/**
* The Telegram columns. Built per plugin instance and typed with literal
* types (not widened to `BetterAuthPluginDBSchema`), so Better Auth infers
* them on `session.user`, server and client, as it does for its own plugins'
* schemas.
*/
function telegramSchema() {
	return {
		user: { fields: {
			telegramId: {
				type: "string",
				required: false,
				unique: false,
				index: true,
				input: false
			},
			telegramPhoneNumber: {
				type: "string",
				required: false,
				unique: false,
				input: false
			},
			telegramUsername: {
				type: "string",
				required: false,
				unique: false,
				input: false
			}
		} },
		account: { fields: {
			telegramId: {
				type: "string",
				required: false,
				unique: false
			},
			telegramUsername: {
				type: "string",
				required: false,
				unique: false
			}
		} }
	};
}
/**
* Creates the conditional Telegram schema extension.
*
* Adds `telegramId`, `telegramUsername`, `telegramPhoneNumber` to the `user` table
* and `telegramId`, `telegramUsername` to the `account` table — but only when
* Login Widget or Mini App flows are enabled. OIDC-only setups skip these fields.
* The type always carries them: they are optional, and simply never set in
* OIDC-only mode.
*/
function createTelegramSchema(config) {
	if (!(config.widgetEnabled || config.miniAppEnabled)) return;
	return telegramSchema();
}
// src/widget-endpoints.ts
/** Every configured bot token; widget data can be signed by any of them. */
function botTokens(config) {
	return config.bots.map((bot) => bot.token).filter(Boolean);
}
/**
* Validates and verifies a Login Widget payload, returning the proven
* Telegram identity. Throws 400 for malformed data and 401 for data that
* Telegram did not sign (or that is too old).
*/
async function verifiedWidgetData(config, body) {
	const tokens = botTokens(config);
	if (tokens.length === 0) throw APIError.from("INTERNAL_SERVER_ERROR", ERROR_CODES.BOT_TOKEN_REQUIRED);
	if (!validateTelegramAuthData(body)) throw APIError.from("BAD_REQUEST", ERROR_CODES.INVALID_AUTH_DATA);
	if (!await verifyTelegramAuthAny(body, tokens, config.maxAuthAge)) throw APIError.from("UNAUTHORIZED", ERROR_CODES.INVALID_AUTHENTICATION);
	return {
		data: body,
		identity: {
			telegramId: String(body.id),
			username: body.username
		}
	};
}
/**
* Creates the Login Widget endpoints: signIn, link, unlink.
*/
function createWidgetEndpoints(config) {
	return {
		signInWithTelegram: createAuthEndpoint("/telegram/signin", {
			method: "POST",
			use: [formCsrfMiddleware]
		}, async (ctx) => {
			const { data, identity } = await verifiedWidgetData(config, ctx.body);
			return startSession(ctx, await findOrCreateTelegramUser(ctx, {
				identity,
				userData: {
					name: data.last_name ? `${data.first_name} ${data.last_name}` : data.first_name,
					image: data.photo_url,
					...await config.mapTelegramDataToUser?.(data)
				},
				allowCreate: config.autoCreateUser,
				method: "telegram-login-widget",
				notFound: ERROR_CODES.USER_CREATION_DISABLED
			}));
		}),
		linkTelegram: createAuthEndpoint("/telegram/link", {
			method: "POST",
			use: [sensitiveSessionMiddleware]
		}, async (ctx) => {
			if (!config.allowUserToLink || ctx.context.options.account?.accountLinking?.enabled === false) throw APIError.from("FORBIDDEN", ERROR_CODES.LINKING_DISABLED);
			const { identity } = await verifiedWidgetData(config, ctx.body);
			await linkTelegramAccount(ctx, ctx.context.session.user, identity);
			await refreshSessionCookie(ctx, ctx.context.session);
			return ctx.json({
				success: true,
				message: SUCCESS_MESSAGES.TELEGRAM_LINKED
			});
		}),
		unlinkTelegram: createAuthEndpoint("/telegram/unlink", {
			method: "POST",
			use: [sensitiveSessionMiddleware, freshSessionMiddleware]
		}, async (ctx) => {
			await unlinkTelegramAccount(ctx, ctx.context.session.user.id);
			await refreshSessionCookie(ctx, ctx.context.session);
			return ctx.json({
				success: true,
				message: SUCCESS_MESSAGES.TELEGRAM_UNLINKED
			});
		})
	};
}
/**
* Rate limit rules for Login Widget endpoints.
*/
function getWidgetRateLimits() {
	return [
		{
			pathMatcher: (path) => path === "/telegram/signin",
			window: 60,
			max: 10
		},
		{
			pathMatcher: (path) => path === "/telegram/link",
			window: 60,
			max: 5
		},
		{
			pathMatcher: (path) => path === "/telegram/unlink",
			window: 60,
			max: 5
		}
	];
}
// src/index.ts
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
const telegram = (options) => {
	const config = createPluginConfig(options);
	return {
		id: PLUGIN_ID,
		init: (ctx) => {
			for (const warning of config.warnings) ctx.logger.warn(warning);
			rememberTelegramProviderIds(ctx, config.oidcProviderIds);
			const identityFields = config.widgetEnabled || config.miniAppEnabled;
			const providers = config.oidcEnabled ? config.bots.flatMap((bot) => bot.oidc && bot.oidcProviderId ? [withTelegramIdentityLinking(createTelegramOIDCProvider(bot.token, {
				...config.oidc,
				clientId: bot.oidc.clientId,
				clientSecret: bot.oidc.clientSecret
			}, ctx.logger, bot.oidcProviderId), identityFields)] : []) : [];
			return {
				...providers.length > 0 ? { context: { socialProviders: [...providers, ...ctx.socialProviders] } } : {},
				options: { databaseHooks: telegramIdentityHooks(ctx, {
					identityFields,
					updateUserInfo: config.oidcEnabled && !!config.oidc?.updateUserInfoOnSignIn
				}) }
			};
		},
		schema: createTelegramSchema(config),
		endpoints: {
			...config.widgetEnabled ? createWidgetEndpoints(config) : {},
			...config.miniAppEnabled ? createMiniAppEndpoints(config) : {},
			...createConfigEndpoint(config)
		},
		hooks: { after: config.oidcProviderIds.length > 0 ? [refreshSessionAfterOIDC] : [] },
		$ERROR_CODES: ERROR_CODES,
		rateLimit: [...config.widgetEnabled ? getWidgetRateLimits() : [], ...config.miniAppEnabled ? getMiniAppRateLimits() : []]
	};
};
export { TELEGRAM_ERROR_CODES, createTelegramOIDCProvider, telegram };

//# sourceMappingURL=index.js.map