import { handle } from "@hono/node-server/vercel";
import { getDb, todos } from "@repo/db";
import { patchTodoSchema, todoFormSchema } from "@repo/schemas";
import { Scalar } from "@scalar/hono-api-reference";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { openAPIRouteHandler, validator } from "hono-openapi";
import { z } from "zod";
import { auth } from "../auth.js";

let db: ReturnType<typeof getDb>;

function getDatabase() {
	if (!db) {
		console.log("🔌 Connecting to database...");
		db = getDb();
		console.log("✅ Database connected");
	}
	return db;
}

interface Variables {
	userId: string;
}

const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.use("*", logger());

/* ================= GLOBAL REQUEST LOGGER ================= */

app.use("*", async (c, next) => {
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("📥 Incoming Request:");
	console.log("➡️ Method:", c.req.method);
	console.log("➡️ Path:", c.req.path);
	console.log("➡️ Origin:", c.req.header("origin"));
	await next();
	console.log("📤 Response Sent:", c.res.status);
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

/* ================= CORS ================= */

app.use(
	"*",
	cors({
		origin: [
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:5173",
			"http://192.168.1.18:3000",
			"https://maestro-done-baclend-web-6eqb.vercel.app",
			"https://maestro-frontned-web.vercel.app",
			"https://maestro-done-baclend-web.vercel.app",
		],
		credentials: true,
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	})
);

app.options("*", (c) => {
	console.log("🟡 OPTIONS Preflight Hit");
	return c.body(null, 204);
});

/* ================= AUTH MIDDLEWARE ================= */

app.use("*", async (c, next) => {
	const path = c.req.path;
	console.log("🔐 Auth Middleware Triggered for:", path);

	if (path.startsWith("/auth") || path === "/openapi" || path === "/docs") {
		console.log("⏭ Skipping Auth for public route");
		return next();
	}

	try {
		const headers = new Headers();
		c.req.raw.headers.forEach((value, key) => {
			headers.set(key, value);
		});

		const session = await auth.api.getSession({ headers });

		console.log("🧾 Session:", session);

		if (!session?.user) {
			console.log("❌ No session found. Unauthorized.");
			return c.json({ message: "Login required" }, 401);
		}

		console.log("✅ Authenticated User:", session.user.id);
		c.set("userId", session.user.id);

		await next();
	} catch (error) {
		console.error("🚨 Auth Error:", error);
		return c.json({ message: "Auth error" }, 500);
	}
});

/* ================= AUTH ROUTES ================= */

app.all("/auth/*", async (c) => {
	console.log("🔑 Auth Route Hit:", c.req.path);
	const res = await auth.handler(c.req.raw);
	console.log("🔑 Auth Handler Response:", res.status);
	return res;
});

/* ================= TEST DB ================= */

app.get("/test-db", async (c) => {
	console.log("🧪 Testing DB...");
	const db = getDatabase();
	await db.select().from(todos).limit(1);
	console.log("✅ DB Query Success");
	return c.json({ ok: true });
});

/* ================= GET TODOS ================= */

app.get("/", async (c) => {
	console.log("📋 GET TODOS");
	const db = getDatabase();
	const userId = c.get("userId");

	console.log("👤 User ID:", userId);

	const data = await db.select().from(todos).where(eq(todos.userId, userId));

	console.log("📦 Todos Fetched:", data.length);

	return c.json(data);
});

/* ================= CREATE TODO ================= */

app.post("/", validator("json", todoFormSchema), async (c) => {
	console.log("➕ CREATE TODO");
	const db = getDatabase();
	const userId = c.get("userId");
	const body = c.req.valid("json");

	console.log("📝 Body:", body);

	const startAt = new Date(`${body.startDate}T${body.startTime}`);
	const endAt = new Date(`${body.endDate}T${body.endTime}`);

	const [todo] = await db
		.insert(todos)
		.values({
			text: body.text,
			description: body.description,
			status: body.status,
			startAt,
			endAt,
			userId,
		})
		.returning();

	console.log("✅ Created Todo:", todo);

	return c.json({ success: true, data: todo }, 201);
});

/* ================= UPDATE TODO ================= */

app.put(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	validator("json", todoFormSchema),
	async (c) => {
		console.log("✏️ UPDATE TODO");

		const db = getDatabase();
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const userId = c.get("userId");

		console.log("🆔 ID:", id);
		console.log("📝 Body:", body);

		const startAt = new Date(`${body.startDate}T${body.startTime}`);
		const endAt = new Date(`${body.endDate}T${body.endTime}`);

		const [todo] = await db
			.update(todos)
			.set({ ...body, startAt, endAt })
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)))
			.returning();

		if (!todo) {
			console.log("❌ Todo Not Found");
			return c.json({ message: "Not found" }, 404);
		}

		console.log("✅ Updated Todo:", todo);
		return c.json({ success: true, data: todo });
	}
);

/* ================= PATCH TODO ================= */

app.patch(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	validator("json", patchTodoSchema),
	async (c) => {
		console.log("🛠 PATCH TODO");

		const db = getDatabase();
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const userId = c.get("userId");

		console.log("🆔 ID:", id);
		console.log("📝 Patch Body:", body);

		const [todo] = await db
			.update(todos)
			.set(body)
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)))
			.returning();

		if (!todo) {
			console.log("❌ Todo Not Found");
			return c.json({ message: "Not found" }, 404);
		}

		console.log("✅ Patched Todo:", todo);
		return c.json({ success: true, data: todo });
	}
);

/* ================= DELETE TODO ================= */

app.delete(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	async (c) => {
		console.log("🗑 DELETE TODO");

		const db = getDatabase();
		const { id } = c.req.valid("param");
		const userId = c.get("userId");

		console.log("🆔 ID:", id);

		const result = await db
			.delete(todos)
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)));

		console.log("🧾 Delete Result:", result.rowCount);

		if (!result.rowCount) {
			console.log("❌ Todo Not Found");
			return c.json({ message: "Not found" }, 404);
		}

		console.log("✅ Deleted Successfully");
		return c.json({ message: "Deleted successfully" });
	}
);

/* ================= OPENAPI ================= */

app.get(
	"/openapi",
	openAPIRouteHandler(app, {
		documentation: {
			info: {
				title: "Todo API",
				version: "1.0.0",
			},
			servers: [{ url: "https://maestro-done-server.vercel.app/api" }],
		},
	})
);

app.get(
	"/docs",
	Scalar({
		url: "/api/openapi",
	})
);

export default handle(app);
