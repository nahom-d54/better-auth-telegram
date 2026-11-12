// src/error-codes.ts
/**
* Error codes of the Telegram plugin. Shared by the server plugin and the
* client entry (`better-auth-telegram/client`), so client code can match
* `error.code` without importing server code.
*/
const TELEGRAM_ERROR_CODES = (0, require("@better-auth/core/utils/error-codes").defineErrorCodes)({
	BOT_TOKEN_REQUIRED: "Telegram plugin: botToken is required",
	BOT_USERNAME_REQUIRED: "Telegram plugin: botUsername is required",
	OIDC_CLIENT_ID_REQUIRED: "Telegram OIDC: oidc.clientId (or botToken) is required before starting an OIDC login",
	OIDC_CLIENT_SECRET_REQUIRED: "Telegram OIDC: oidc.clientSecret is required before starting an OIDC login. It is the Client Secret shown in @BotFather (your bot > Login Widget), not the bot token",
	INVALID_AUTH_DATA: "Invalid Telegram auth data",
	INVALID_AUTHENTICATION: "Invalid Telegram authentication",
	USER_CREATION_DISABLED: "User not found and auto-create is disabled",
	NOT_AUTHENTICATED: "Not authenticated",
	LINKING_DISABLED: "Linking Telegram accounts is disabled",
	TELEGRAM_ALREADY_LINKED_OTHER: "This Telegram account is already linked to another user",
	TELEGRAM_ALREADY_LINKED_SELF: "This Telegram account is already linked to your account",
	NOT_LINKED: "No Telegram account linked",
	DIFFERENT_TELEGRAM_ACCOUNT_LINKED: "A different Telegram account is already linked to your account",
	ACCOUNT_NOT_LINKED: "A user with this Telegram account exists, but the account is not linked and account linking does not allow linking it on sign-in",
	CANNOT_UNLINK_LAST_ACCOUNT: "Cannot unlink Telegram: it is the only way to sign in to this account",
	USER_CREATION_REJECTED: "User creation was rejected",
	ACCOUNT_CREATION_REJECTED: "Telegram account creation was rejected",
	ACCOUNT_UNLINK_REJECTED: "Telegram account removal was rejected",
	IDENTITY_UPDATE_REJECTED: "Telegram identity update was rejected",
	ORPHANED_ACCOUNT: "Telegram account references a user that does not exist",
	INIT_DATA_REQUIRED: "initData is required and must be a string",
	INVALID_MINI_APP_INIT_DATA: "Invalid Mini App initData",
	INVALID_MINI_APP_DATA_STRUCTURE: "Invalid Mini App data structure",
	NO_USER_IN_INIT_DATA: "No user data in initData",
	MINI_APP_AUTO_SIGNIN_DISABLED: "User not found and auto-signin is disabled for Mini Apps",
	PLACEHOLDER_EMAIL_RESERVED: "Telegram placeholder email addresses are reserved for Telegram sign-in"
});
// src/constants.ts
const ERROR_CODES = TELEGRAM_ERROR_CODES;
const SUCCESS_MESSAGES = {
	TELEGRAM_LINKED: "Telegram account linked successfully",
	TELEGRAM_UNLINKED: "Telegram account unlinked successfully"
};
const PLUGIN_ID = "telegram";
const DEFAULT_MAX_AUTH_AGE = 86400;
const TELEGRAM_OIDC_PROVIDER_ID = "telegram-oidc";
/** Domains of the placeholder emails, keyed by namespace (provider id). */
const PLACEHOLDER_EMAIL_DOMAINS = {
	[PLUGIN_ID]: `${PLUGIN_ID}.placeholder.invalid`,
	[TELEGRAM_OIDC_PROVIDER_ID]: `${TELEGRAM_OIDC_PROVIDER_ID}.placeholder.invalid`
};
const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_OIDC_AUTH_ENDPOINT = "https://oauth.telegram.org/auth";
const TELEGRAM_OIDC_TOKEN_ENDPOINT = "https://oauth.telegram.org/token";
const TELEGRAM_OIDC_JWKS_URI = "https://oauth.telegram.org/.well-known/jwks.json";
Object.defineProperty(exports, "DEFAULT_MAX_AUTH_AGE", {
	enumerable: true,
	get: function() {
		return DEFAULT_MAX_AUTH_AGE;
	}
});
Object.defineProperty(exports, "ERROR_CODES", {
	enumerable: true,
	get: function() {
		return ERROR_CODES;
	}
});
Object.defineProperty(exports, "PLACEHOLDER_EMAIL_DOMAINS", {
	enumerable: true,
	get: function() {
		return PLACEHOLDER_EMAIL_DOMAINS;
	}
});
Object.defineProperty(exports, "PLUGIN_ID", {
	enumerable: true,
	get: function() {
		return PLUGIN_ID;
	}
});
Object.defineProperty(exports, "SUCCESS_MESSAGES", {
	enumerable: true,
	get: function() {
		return SUCCESS_MESSAGES;
	}
});
Object.defineProperty(exports, "TELEGRAM_ERROR_CODES", {
	enumerable: true,
	get: function() {
		return TELEGRAM_ERROR_CODES;
	}
});
Object.defineProperty(exports, "TELEGRAM_OIDC_AUTH_ENDPOINT", {
	enumerable: true,
	get: function() {
		return TELEGRAM_OIDC_AUTH_ENDPOINT;
	}
});
Object.defineProperty(exports, "TELEGRAM_OIDC_ISSUER", {
	enumerable: true,
	get: function() {
		return TELEGRAM_OIDC_ISSUER;
	}
});
Object.defineProperty(exports, "TELEGRAM_OIDC_JWKS_URI", {
	enumerable: true,
	get: function() {
		return TELEGRAM_OIDC_JWKS_URI;
	}
});
Object.defineProperty(exports, "TELEGRAM_OIDC_PROVIDER_ID", {
	enumerable: true,
	get: function() {
		return TELEGRAM_OIDC_PROVIDER_ID;
	}
});
Object.defineProperty(exports, "TELEGRAM_OIDC_TOKEN_ENDPOINT", {
	enumerable: true,
	get: function() {
		return TELEGRAM_OIDC_TOKEN_ENDPOINT;
	}
});

//# sourceMappingURL=constants-C8XT924S.cjs.map