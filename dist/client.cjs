Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
const require_constants = require("./constants-C8XT924S.cjs");
// src/client-widget.ts
/**
* Telegram Login Widget script URL
*/
const TELEGRAM_WIDGET_SCRIPT = "https://telegram.org/js/telegram-widget.js?24";
/** The widget script load in flight, shared by widgets initialized meanwhile. */
let widgetScriptLoading;
/**
* Helper to load Telegram Widget script
*/
function loadTelegramWidgetScript() {
	if (window.Telegram?.Login) return Promise.resolve();
	widgetScriptLoading ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = TELEGRAM_WIDGET_SCRIPT;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(/* @__PURE__ */ new Error("Failed to load Telegram widget script"));
		document.head.appendChild(script);
	}).finally(() => {
		widgetScriptLoading = void 0;
	});
	return widgetScriptLoading;
}
const pendingRenders = /* @__PURE__ */ new WeakMap();
let widgetCount = 0;
/** A global name for a widget's `data-onauth` callback that no widget uses yet. */
function nextCallbackName() {
	let name;
	do {
		widgetCount += 1;
		name = `telegramCallback_${widgetCount}`;
	} while (name in window);
	return name;
}
function requireBotUsername(botUsername) {
	if (!botUsername) throw new Error("Telegram plugin: botUsername is required");
	return botUsername;
}
function resolveContainer(container) {
	if (typeof container !== "string") return container;
	const element = document.getElementById(container);
	if (!element) throw new Error(`Container with id "${container}" not found`);
	return element;
}
/**
* Loads Telegram's widget script, fetches the bot username and renders the
* widget into `container` (replacing its content).
*/
async function renderWidget($fetch, container, options, loginAttributes) {
	const element = resolveContainer(container);
	const request = Symbol("widget initialization");
	pendingRenders.set(element, request);
	await loadTelegramWidgetScript();
	const configResponse = await $fetch("/telegram/config", {
		method: "GET",
		throw: false,
		...options.bot ? { query: { bot: options.bot } } : {}
	});
	if (pendingRenders.get(element) !== request) return null;
	if (!configResponse.data) throw new Error("Failed to get Telegram config");
	const botUsername = requireBotUsername(configResponse.data.botUsername);
	const { size = "large", showUserPhoto = true, cornerRadius = 20, requestAccess = false, lang } = options;
	element.innerHTML = "";
	const script = document.createElement("script");
	script.src = TELEGRAM_WIDGET_SCRIPT;
	script.async = true;
	script.setAttribute("data-telegram-login", botUsername);
	script.setAttribute("data-size", size);
	script.setAttribute("data-userpic", showUserPhoto.toString());
	script.setAttribute("data-radius", cornerRadius.toString());
	for (const [name, value] of Object.entries(loginAttributes)) script.setAttribute(name, value);
	if (requestAccess) script.setAttribute("data-request-access", "write");
	if (lang) script.setAttribute("data-lang", lang);
	element.appendChild(script);
	return { destroy: () => {
		script._iframe?.remove();
		script.remove();
	} };
}
/** Widget actions share one renderer so callback and redirect modes stay consistent. */
function createTelegramWidgetActions($fetch) {
	return {
		/**
		* Initialize Telegram Login Widget
		* This function creates a Telegram login button and handles the authentication flow
		*
		* @param container - The element to render into, or its id
		* @param options - Widget configuration options
		* @param onAuth - Callback function called when user successfully authenticates
		* @returns The widget; `destroy()` removes it (effect cleanup)
		*
		* @example
		* ```ts
		* const widget = await initTelegramWidget("telegram-login-container", {
		*   size: "large",
		*   showUserPhoto: true
		* }, async (authData) => {
		*   const result = await signInWithTelegram(authData);
		*   console.log("Signed in:", result);
		* });
		* // later: widget.destroy();
		* ```
		*/
		initTelegramWidget: async (container, options = {}, onAuth) => {
			const callbackName = nextCallbackName();
			const widget = await renderWidget($fetch, container, options, { "data-onauth": `${callbackName}(user)` });
			if (!widget) return { destroy: () => {} };
			window[callbackName] = async (authData) => {
				try {
					await onAuth(authData);
				} catch (error) {
					console.error("[better-auth-telegram] Telegram widget onAuth failed:", error);
				}
			};
			return { destroy: () => {
				widget.destroy();
				delete window[callbackName];
			} };
		},
		/**
		* Alternative method: Use Telegram Login with redirect
		*
		* @param container - The element to render into, or its id
		* @param redirectUrl - URL to redirect after successful authentication
		* @param options - Widget configuration options
		* @returns The widget; `destroy()` removes it
		*
		* @example
		* ```ts
		* await initTelegramWidgetRedirect(
		*   "telegram-login",
		*   "/auth/telegram/callback",
		*   { size: "medium" }
		* );
		* ```
		*/
		initTelegramWidgetRedirect: async (container, redirectUrl, options = {}) => await renderWidget($fetch, container, options, { "data-auth-url": redirectUrl }) ?? { destroy: () => {} }
	};
}
// src/client.ts
function getMiniAppInitData() {
	const sdkInitData = window.Telegram?.WebApp?.initData;
	if (sdkInitData) return sdkInitData;
	try {
		const { hash } = window.location;
		if (!hash) return;
		return new URLSearchParams(hash.slice(1)).get("tgWebAppData") || void 0;
	} catch {
		return;
	}
}
/** Routes after which the signed-in user (or their Telegram identity) changed. */
const SESSION_CHANGING_PATHS = /* @__PURE__ */ new Set([
	"/telegram/signin",
	"/telegram/link",
	"/telegram/unlink",
	"/telegram/miniapp/signin"
]);
/**
* Client plugin for Telegram authentication
*/
const telegramClient = () => {
	return {
		id: "telegram",
		$InferServerPlugin: {},
		$ERROR_CODES: require_constants.TELEGRAM_ERROR_CODES,
		pathMethods: { "/telegram/unlink": "POST" },
		atomListeners: [{
			matcher: (path) => SESSION_CHANGING_PATHS.has(path),
			signal: "$sessionSignal"
		}],
		getActions: ($fetch, $store) => {
			/**
			* Calls a session-changing route and, when it succeeds, tells
			* `useSession` to refetch (as Better Auth's oauth-popup client does).
			*/
			const changeSession = async (path, fetchOptions) => {
				const response = await $fetch(path, {
					method: "POST",
					...fetchOptions
				});
				if (!(response.error || fetchOptions.disableSignal)) $store.notify("$sessionSignal");
				return response;
			};
			return {
				/**
				* Sign in with Telegram
				* @param authData - Authentication data from Telegram Login Widget
				* @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
				*/
				signInWithTelegram: async (authData, fetchOptions) => await changeSession("/telegram/signin", {
					body: authData,
					...fetchOptions
				}),
				/**
				* Link current user account with Telegram
				* @param authData - Authentication data from Telegram Login Widget
				* @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
				*/
				linkTelegram: async (authData, fetchOptions) => await changeSession("/telegram/link", {
					body: authData,
					...fetchOptions
				}),
				/**
				* Unlink Telegram account from current user
				* @param fetchOptions - Optional fetch options (e.g., custom headers, cache control)
				*/
				unlinkTelegram: async (fetchOptions) => await changeSession("/telegram/unlink", { ...fetchOptions }),
				/**
				* Get Telegram bot configuration
				* @param options - Optional bot key and fetch options (e.g., headers)
				*/
				getTelegramConfig: async (options) => {
					const { bot, ...fetchOptions } = options ?? {};
					return await $fetch("/telegram/config", {
						method: "GET",
						...fetchOptions,
						...bot ? { query: {
							...fetchOptions.query ?? {},
							bot
						} } : {}
					});
				},
				...createTelegramWidgetActions($fetch),
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
				signInWithMiniApp: async (initData, fetchOptions) => await changeSession("/telegram/miniapp/signin", {
					body: { initData },
					...fetchOptions
				}),
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
				validateMiniApp: async (initData, fetchOptions) => {
					return await $fetch("/telegram/miniapp/validate", {
						method: "POST",
						body: { initData },
						...fetchOptions
					});
				},
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
				autoSignInFromMiniApp: async (fetchOptions) => {
					if (typeof window === "undefined") throw new Error("This method can only be called in browser");
					const initData = getMiniAppInitData();
					if (!initData) throw new Error("Not running in Telegram Mini App or initData not available");
					return await changeSession("/telegram/miniapp/signin", {
						body: { initData },
						...fetchOptions
					});
				},
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
				signInWithTelegramOIDC: async (options, fetchOptions) => {
					return await $fetch("/sign-in/social", {
						method: "POST",
						body: {
							provider: options?.providerId ?? (options?.bot && options.bot !== "default" ? `telegram-oidc-${options.bot}` : "telegram-oidc"),
							callbackURL: options?.callbackURL,
							errorCallbackURL: options?.errorCallbackURL
						},
						...fetchOptions
					});
				}
			};
		}
	};
};
exports.TELEGRAM_ERROR_CODES = require_constants.TELEGRAM_ERROR_CODES;
exports.default = telegramClient;
exports.telegramClient = telegramClient;

//# sourceMappingURL=client.cjs.map