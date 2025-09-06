/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {beforeUserSignedIn} = require("firebase-functions/v2/identity");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({maxInstances: 10});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

exports.helloWorld = onRequest((request, response) => {
	logger.info("Hello logs!", {structuredData: true});
	response.send("Hello from Firebase!");
});

// Initialize Admin SDK once
try {
	admin.initializeApp();
} catch (e) {
	// No-op if already initialized
}

// --- Auth blocking: permitir solo emails en allowlist y marcar sesión como allowed ---
function getAllowList() {
	let list = [];
	if (process.env.ALLOWLIST) {
		list = list.concat(String(process.env.ALLOWLIST).split(","));
	}
	try {
		const cfg = require("firebase-functions").config();
		const v = cfg && cfg.auth && cfg.auth.allowlist;
		if (Array.isArray(v)) list = list.concat(v);
		else if (typeof v === "string") list = list.concat(v.split(","));
	} catch (_) { /* ignore */ }
	const cleaned = list.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean);
	return new Set(cleaned);
}

function isAllowedEmail(email, allowSet) {
	const e = String(email || "").toLowerCase();
	if (!e) return false;
	if (allowSet.has(e)) return true;
	// Soportar reglas de dominio con prefijo '@dominio.tld'
	for (const item of allowSet) {
		if (item.startsWith("@") && e.endsWith(item)) return true;
	}
	return false;
}

exports.allowlistedSignIn = beforeUserSignedIn(async (event) => {
	const allowSet = getAllowList();
	// Si no hay allowlist configurada, no bloquear (modo abierto)
	if (!allowSet || allowSet.size === 0) {
		return {sessionClaims: {allowed: true}};
	}
	const email = event?.data?.email || "";
	if (!isAllowedEmail(email, allowSet)) {
		throw new Error("Email no autorizado para iniciar sesión");
	}
	// Marca de sesión para reglas de Firestore
	return {sessionClaims: {allowed: true}};
});

/**
 * Seed protected endpoint
 * Usage (POST):
 *   https://<region>-<project>.cloudfunctions.net/seedPublicData?appId=organizacioncentro-d3cd7&force=1
 * Headers:
 *   x-seed-token: <token>
 * Security: set a secret named SEED_TOKEN in Cloud Functions environment.
 */
exports.seedPublicData = onRequest(async (req, res) => {
	// Only allow POST to avoid accidental triggering from the browser
	if (req.method !== "POST") {
		res.status(405).send("Method Not Allowed");
		return;
	}

		const providedToken = req.get("x-seed-token") || req.query.token;
		let configuredToken = process.env.SEED_TOKEN || process.env.seed_token;
		// Fallback to functions config: firebase functions:config:set seed.token="<value>"
		try {
			if (!configuredToken) {
				const cfg = require("firebase-functions").config();
				configuredToken = (cfg && cfg.seed && cfg.seed.token) ? cfg.seed.token : configuredToken;
			}
		} catch (_) {
			// ignore if config not available
		}

	if (!configuredToken) {
		logger.error("SEED_TOKEN not configured in environment.");
		res.status(500).json({error: "SEED_TOKEN not configured"});
		return;
	}
	if (!providedToken || providedToken !== configuredToken) {
		res.status(401).json({error: "Unauthorized"});
		return;
	}

	const appId = (req.query.appId || "organizacioncentro-d3cd7").toString();
	const force = (req.query.force === "1" || req.query.force === "true");

	try {
		const db = admin.firestore();
		const colPath = (name) => `artifacts/${appId}/public/data/${name}`;
		const targets = ["documentos", "anuncios", "actividades", "agenda"];

		const empties = [];
		for (const name of targets) {
			if (force) {
				empties.push(name);
				continue;
			}
			const snap = await db.collection(colPath(name)).limit(1).get();
			if (snap.empty) empties.push(name);
		}

		const now = Date.now();
		const writes = [];
		if (empties.includes("documentos")) {
			writes.push(db.collection(colPath("documentos")).add({
				nombre: "Proyecto Educativo de Centro",
				archivo: "pec.pdf",
				fecha: new Date().toLocaleDateString("es-ES"),
				timestamp: now,
			}));
		}
		if (empties.includes("anuncios")) {
			writes.push(db.collection(colPath("anuncios")).add({
				texto: "Claustro general el próximo viernes a las 12:00.",
				timestamp: now,
			}));
		}
		if (empties.includes("actividades")) {
			const today = new Date();
			const y = today.getFullYear();
			const m = String(today.getMonth() + 1).padStart(2, "0");
			const d = String(Math.min(28, today.getDate())).padStart(2, "0");
			writes.push(db.collection(colPath("actividades")).add({
				title: "Reunión de ciclo",
				date: `${y}-${m}-${d}`,
				timestamp: now,
			}));
		}
		if (empties.includes("agenda")) {
			const today = new Date();
			const y = today.getFullYear();
			const m = String(today.getMonth() + 1).padStart(2, "0");
			const d = String(Math.min(28, today.getDate())).padStart(2, "0");
			writes.push(db.collection(colPath("agenda")).add({
				title: "Seguimiento Programación Didáctica",
				date: `${y}-${m}-${d}`,
				status: "Programada",
				documento: "",
				description: "Revisión de objetivos y acuerdos del trimestre.",
				timestamp: now,
			}));
		}

		await Promise.all(writes);
		logger.info("Seed completed", {appId, force, collections: empties});
		res.json({ok: true, seeded: empties, appId, force});
	} catch (err) {
		logger.error("Seed error", err);
		res.status(500).json({error: (err && err.message) ? err.message : String(err)});
	}
});

// Helpers for admin token from env or functions config
function getAdminTokenFromEnv() {
	let t = process.env.ADMIN_TOKEN || process.env.admin_token;
	try {
		if (!t) {
			const cfg = require("firebase-functions").config();
			t = (cfg && cfg.admin && cfg.admin.token) ? cfg.admin.token : t;
		}
	} catch (_) {}
	return t;
}

async function resolveUid(dbAuth, uid, email) {
	if (uid) return uid;
	if (email) {
		const rec = await dbAuth.getUserByEmail(email);
		return rec.uid;
	}
	throw new Error("Provide uid or email");
}

// POST: set admin=true/false for a user (by uid or email)
exports.setAdminClaim = onRequest(async (req, res) => {
	if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
	const token = req.get("x-admin-token") || req.query.token;
	const expected = getAdminTokenFromEnv();
	if (!expected) { res.status(500).json({error: "ADMIN_TOKEN not configured"}); return; }
	if (!token || token !== expected) { res.status(401).json({error: "Unauthorized"}); return; }
	try {
		const dbAuth = admin.auth();
		const {uid, email, admin: adminFlag} = (typeof req.body === 'object' && req.body) ? req.body : {};
		const targetUid = await resolveUid(dbAuth, uid, email);
		const user = await dbAuth.getUser(targetUid);
		const claims = Object.assign({}, user.customClaims || {}, {admin: !!adminFlag});
		await dbAuth.setCustomUserClaims(targetUid, claims);
		res.json({ok: true, uid: targetUid, admin: !!adminFlag});
	} catch (err) {
		logger.error("setAdminClaim error", err);
		res.status(500).json({error: (err && err.message) ? err.message : String(err)});
	}
});

// POST: revoke admin (admin=false)
exports.revokeAdminClaim = onRequest(async (req, res) => {
	if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
	const token = req.get("x-admin-token") || req.query.token;
	const expected = getAdminTokenFromEnv();
	if (!expected) { res.status(500).json({error: "ADMIN_TOKEN not configured"}); return; }
	if (!token || token !== expected) { res.status(401).json({error: "Unauthorized"}); return; }
	try {
		const dbAuth = admin.auth();
		const {uid, email} = (typeof req.body === 'object' && req.body) ? req.body : {};
		const targetUid = await resolveUid(dbAuth, uid, email);
		const user = await dbAuth.getUser(targetUid);
		const claims = Object.assign({}, user.customClaims || {});
		claims.admin = false;
		await dbAuth.setCustomUserClaims(targetUid, claims);
		res.json({ok: true, uid: targetUid, admin: false});
	} catch (err) {
		logger.error("revokeAdminClaim error", err);
		res.status(500).json({error: (err && err.message) ? err.message : String(err)});
	}
});
