import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";

// <api-imports>
import auth_action_get_0 from "./api/auth/[action]/GET";
import auth_action_post_1 from "./api/auth/[action]/POST";
import auth_action_detail_get_2 from "./api/auth/[action]/[detail]/GET";
import auth_action_detail_post_3 from "./api/auth/[action]/[detail]/POST";
import company_get_4 from "./api/company/GET";
import company_put_5 from "./api/company/PUT";
import cost_guide_get_6 from "./api/cost-guide/GET";
import cost_guide_post_7 from "./api/cost-guide/POST";
import cost_guide_id_delete_8 from "./api/cost-guide/[id]/DELETE";
import cost_guide_id_put_9 from "./api/cost-guide/[id]/PUT";
import estimates_get_10 from "./api/estimates/GET";
import estimates_post_11 from "./api/estimates/POST";
import estimates_id_delete_12 from "./api/estimates/[id]/DELETE";
import estimates_id_get_13 from "./api/estimates/[id]/GET";
import estimates_id_put_14 from "./api/estimates/[id]/PUT";
import files_get_15 from "./api/files/GET";
import files_post_16 from "./api/files/POST";
import files_id_delete_17 from "./api/files/[id]/DELETE";
import files_id_download_get_18 from "./api/files/[id]/download/GET";
import fleet_get_19 from "./api/fleet/GET";
import fleet_post_20 from "./api/fleet/POST";
import fleet_flags_get_21 from "./api/fleet/flags/GET";
import fleet_id_get_22 from "./api/fleet/[id]/GET";
import fleet_id_put_23 from "./api/fleet/[id]/PUT";
import fleet_id_files_get_24 from "./api/fleet/[id]/files/GET";
import fleet_id_prestarts_get_25 from "./api/fleet/[id]/prestarts/GET";
import fleet_id_prestarts_post_26 from "./api/fleet/[id]/prestarts/POST";
import form_templates_get_27 from "./api/form-templates/GET";
import form_templates_post_28 from "./api/form-templates/POST";
import form_templates_id_delete_29 from "./api/form-templates/[id]/DELETE";
import form_templates_id_put_30 from "./api/form-templates/[id]/PUT";
import health_get_31 from "./api/health/GET";
import jobs_get_32 from "./api/jobs/GET";
import jobs_post_33 from "./api/jobs/POST";
import jobs_id_get_34 from "./api/jobs/[id]/GET";
import jobs_id_put_35 from "./api/jobs/[id]/PUT";
import jobs_id_files_get_36 from "./api/jobs/[id]/files/GET";
import jobs_id_photos_get_37 from "./api/jobs/[id]/photos/GET";
import jobs_id_photos_post_38 from "./api/jobs/[id]/photos/POST";
import jobs_id_photos_photoId_delete_39 from "./api/jobs/[id]/photos/[photoId]/DELETE";
import jobs_id_photos_photoId_patch from "./api/jobs/[id]/photos/[photoId]/PATCH";
import jobs_id_photos_photoId_replace_post from "./api/jobs/[id]/photos/[photoId]/replace/POST";
import jobs_id_photos_photoId_download_get_40 from "./api/jobs/[id]/photos/[photoId]/download/GET";
import me_get_41 from "./api/me/GET";
import me_put_42 from "./api/me/PUT";
import me_change_password_post_43 from "./api/me/change-password/POST";
import migrate_estimates_post_44 from "./api/migrate-estimates/POST";
import migrate_estimating_library_post_45 from "./api/migrate-estimating-library/POST";
import migrate_files_post_46 from "./api/migrate-files/POST";
import migrate_fleet_post_47 from "./api/migrate-fleet/POST";
import migrate_form_templates_post_48 from "./api/migrate-form-templates/POST";
import migrate_job_photos_post_49 from "./api/migrate-job-photos/POST";
import migrate_jobs_post_50 from "./api/migrate-jobs/POST";
import migrate_owner_role_post_51 from "./api/migrate-owner-role/POST";
import migrate_team_post_52 from "./api/migrate-team/POST";
import migrate_job_tabs_post_53x from "./api/migrate-job-tabs/POST";
import dashboard_todos_get_54x from "./api/dashboard/todos/GET";
import jobs_id_todos_get_55x from "./api/jobs/[id]/todos/GET";
import jobs_id_todos_post_56x from "./api/jobs/[id]/todos/POST";
import jobs_id_todos_todoId_put_57x from "./api/jobs/[id]/todos/[todoId]/PUT";
import jobs_id_todos_todoId_delete_58x from "./api/jobs/[id]/todos/[todoId]/DELETE";
import jobs_id_progress_get_59x from "./api/jobs/[id]/progress/GET";
import jobs_id_progress_put_60x from "./api/jobs/[id]/progress/PUT";
import jobs_id_progress_sync_post_61x from "./api/jobs/[id]/progress/sync/POST";
import recipes_get_53 from "./api/recipes/GET";
import recipes_post_54 from "./api/recipes/POST";
import recipes_id_delete_55 from "./api/recipes/[id]/DELETE";
import recipes_id_put_56 from "./api/recipes/[id]/PUT";
import signup_post_57 from "./api/signup/POST";
import team_get_58 from "./api/team/GET";
import team_invite_post_59 from "./api/team/invite/POST";
import team_id_delete_60 from "./api/team/[id]/DELETE";
import team_id_put_61 from "./api/team/[id]/PUT";
import migrate_form_fields_post from "./api/migrate-form-fields/POST";
import forms_id_fields_get from "./api/forms/[id]/fields/GET";
import forms_id_fields_post from "./api/forms/[id]/fields/POST";
import forms_id_fields_reorder_post from "./api/forms/[id]/fields/reorder/POST";
import forms_id_fields_fieldId_patch from "./api/forms/[id]/fields/[fieldId]/PATCH";
import forms_id_fields_fieldId_delete from "./api/forms/[id]/fields/[fieldId]/DELETE";
import migrate_job_forms_post from "./api/migrate-job-forms/POST";
import jobs_id_forms_get from "./api/jobs/[id]/forms/GET";
import jobs_id_forms_post from "./api/jobs/[id]/forms/POST";
// </api-imports>
import { seoRoutes } from "../lib/seo-routes";
import {
	loadAdSenseRuntimeConfig,
	resolveAdSenseTextFile,
	type AdSenseRuntimeConfig,
} from "./adsense-manifest";
import { isSystemHost } from "./seo-host";
import { llmsTxtHandler } from "./llms-txt";

export interface SsrRenderResult {
	html: string;
	head: string;
	status: number;
	redirect?: string;
}

export function registerAdSenseTextRoutes(app: Express, config: AdSenseRuntimeConfig): void {
	app.get("/ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "adsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});

	app.get("/app-ads.txt", (_req, res) => {
		const content = resolveAdSenseTextFile(config, "appAdsTxt");
		if (content === null) {
			res
				.status(404)
				.type("text/plain")
				.set("Cache-Control", "no-cache")
				.send("Not found\n");
			return;
		}
		res.type("text/plain").set("Cache-Control", "no-cache").send(content);
	});
}

export function renderSsrDocument(
	template: string,
	result: Pick<SsrRenderResult, "head" | "html">,
	adSenseConfig: Pick<AdSenseRuntimeConfig, "scriptHtml">,
): string {
	const head = [result.head, adSenseConfig.scriptHtml].filter(Boolean).join("\n");
	return template
		.replace("<!--app-head-->", () => head)
		.replace("<!--app-html-->", () => result.html);
}

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

normalizeCommerceApiBaseUrlEnv();

const app = express();

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// <api-registrations>
app.get("/api/auth/:action", auth_action_get_0);
app.post("/api/auth/:action", auth_action_post_1);
app.get("/api/auth/:action/:detail", auth_action_detail_get_2);
app.post("/api/auth/:action/:detail", auth_action_detail_post_3);
app.get("/api/company", company_get_4);
app.put("/api/company", company_put_5);
app.get("/api/cost-guide", cost_guide_get_6);
app.post("/api/cost-guide", cost_guide_post_7);
app.delete("/api/cost-guide/:id", cost_guide_id_delete_8);
app.put("/api/cost-guide/:id", cost_guide_id_put_9);
app.get("/api/estimates", estimates_get_10);
app.post("/api/estimates", estimates_post_11);
app.delete("/api/estimates/:id", estimates_id_delete_12);
app.get("/api/estimates/:id", estimates_id_get_13);
app.put("/api/estimates/:id", estimates_id_put_14);
app.get("/api/files", files_get_15);
app.post("/api/files", files_post_16);
app.delete("/api/files/:id", files_id_delete_17);
app.get("/api/files/:id/download", files_id_download_get_18);
app.get("/api/fleet", fleet_get_19);
app.post("/api/fleet", fleet_post_20);
app.get("/api/fleet/flags", fleet_flags_get_21);
app.get("/api/fleet/:id", fleet_id_get_22);
app.put("/api/fleet/:id", fleet_id_put_23);
app.get("/api/fleet/:id/files", fleet_id_files_get_24);
app.get("/api/fleet/:id/prestarts", fleet_id_prestarts_get_25);
app.post("/api/fleet/:id/prestarts", fleet_id_prestarts_post_26);
app.get("/api/form-templates", form_templates_get_27);
app.post("/api/form-templates", form_templates_post_28);
app.delete("/api/form-templates/:id", form_templates_id_delete_29);
app.put("/api/form-templates/:id", form_templates_id_put_30);
app.get("/api/forms/:id/fields", forms_id_fields_get);
app.post("/api/forms/:id/fields", forms_id_fields_post);
app.post("/api/forms/:id/fields/reorder", forms_id_fields_reorder_post);
app.patch("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_patch);
app.delete("/api/forms/:id/fields/:fieldId", forms_id_fields_fieldId_delete);
app.post("/api/migrate-form-fields", migrate_form_fields_post);
app.post("/api/migrate-job-forms", migrate_job_forms_post);
app.get("/api/jobs/:id/forms", jobs_id_forms_get);
app.post("/api/jobs/:id/forms", jobs_id_forms_post);
app.get("/api/health", health_get_31);
app.get("/api/jobs", jobs_get_32);
app.post("/api/jobs", jobs_post_33);
app.get("/api/jobs/:id", jobs_id_get_34);
app.put("/api/jobs/:id", jobs_id_put_35);
app.get("/api/jobs/:id/files", jobs_id_files_get_36);
app.get("/api/jobs/:id/photos", jobs_id_photos_get_37);
app.post("/api/jobs/:id/photos", jobs_id_photos_post_38);
app.delete("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_delete_39);
app.patch("/api/jobs/:id/photos/:photoId", jobs_id_photos_photoId_patch);
app.post("/api/jobs/:id/photos/:photoId/replace", jobs_id_photos_photoId_replace_post);
app.get("/api/jobs/:id/photos/:photoId/download", jobs_id_photos_photoId_download_get_40);
app.get("/api/jobs/:id/todos", jobs_id_todos_get_55x);
app.post("/api/jobs/:id/todos", jobs_id_todos_post_56x);
app.put("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_put_57x);
app.delete("/api/jobs/:id/todos/:todoId", jobs_id_todos_todoId_delete_58x);
app.get("/api/jobs/:id/progress", jobs_id_progress_get_59x);
app.put("/api/jobs/:id/progress", jobs_id_progress_put_60x);
app.post("/api/jobs/:id/progress/sync", jobs_id_progress_sync_post_61x);
app.get("/api/me", me_get_41);
app.put("/api/me", me_put_42);
app.post("/api/me/change-password", me_change_password_post_43);
app.post("/api/migrate-estimates", migrate_estimates_post_44);
app.post("/api/migrate-estimating-library", migrate_estimating_library_post_45);
app.post("/api/migrate-files", migrate_files_post_46);
app.post("/api/migrate-fleet", migrate_fleet_post_47);
app.post("/api/migrate-form-templates", migrate_form_templates_post_48);
app.post("/api/migrate-job-photos", migrate_job_photos_post_49);
app.post("/api/migrate-jobs", migrate_jobs_post_50);
app.post("/api/migrate-owner-role", migrate_owner_role_post_51);
app.post("/api/migrate-team", migrate_team_post_52);
app.post("/api/migrate-job-tabs", migrate_job_tabs_post_53x);
app.get("/api/dashboard/todos", dashboard_todos_get_54x);
app.get("/api/recipes", recipes_get_53);
app.post("/api/recipes", recipes_post_54);
app.delete("/api/recipes/:id", recipes_id_delete_55);
app.put("/api/recipes/:id", recipes_id_put_56);
app.post("/api/signup", signup_post_57);
app.get("/api/team", team_get_58);
app.post("/api/team/invite", team_invite_post_59);
app.delete("/api/team/:id", team_id_delete_60);
app.put("/api/team/:id", team_id_put_61);
// </api-registrations>

// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	console.error("ssr.api.error", {
		url: req.url,
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	if (isSystemHost(req)) {
		res
			.type("text/plain")
			.set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host")
			.send("User-agent: *\nDisallow: /\n");
		return;
	}
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	if (isSystemHost(req)) {
		const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n`;
		res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(empty);
		return;
	}
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/llms.txt", llmsTxtHandler);

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");
	const adSenseRuntimeConfig = loadAdSenseRuntimeConfig(__dirname);

	registerAdSenseTextRoutes(app, adSenseRuntimeConfig);

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	let renderFn: ((url: string) => Promise<SsrRenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () =>
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(req.url);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: req.url,
					status: result.status,
				});
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Per-host SEO injection. System URLs get a noindex meta so
			// crawlers drop them from the index over time; customer-attached
			// hosts get a self-canonical link so search engines treat them
			// as authoritative for the rendered content.
			const seoHead = isSystemHost(req)
				? `<meta name="robots" content="noindex,nofollow">`
				: `<link rel="canonical" href="${escapeXml(`${req.protocol}://${req.hostname}${req.path}`)}">`;
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			const out = renderSsrDocument(
				template,
				{ ...result, head: seoHead + result.head },
				adSenseRuntimeConfig,
			);
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-cache")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: req.url,
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// Scope the ERR_MODULE_NOT_FOUND suppression to the import() only.
		// A closeConnection() failure that happens to carry the same code
		// (unlikely but possible for wrapped errors) must not be silently
		// swallowed - it indicates a real db-close failure worth logging.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			const dbClient = "./db/client" + ".js";
			mod = await import(/* @vite-ignore */ dbClient);
		} catch (error: unknown) {
			const code = (error as { code?: string } | null)?.code;
			if (code !== "ERR_MODULE_NOT_FOUND") {
				console.error("ssr.shutdown.db-import-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (mod && typeof mod.closeConnection === "function") {
			try {
				await mod.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";
	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		// parseInt("abc") returns NaN; passing that to app.listen throws
		// synchronously before the server.on("error") handler below can catch
		// it. Fail fast with an actionable log rather than a cryptic crash.
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";
	const server = app.listen(port, host, () => {
		console.log(`Server listening on http://${host}:${port}`);
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;
