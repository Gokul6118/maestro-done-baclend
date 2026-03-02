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
		db = getDb();
		console.log("Database connected");
	}
	return db;
}

interface Variables {
	userId: string;
}

const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.use("*", logger());

/* ================= CORS (FIXED) ================= */

app.use(
	"*",
	cors({
		origin: [
			"http://localhost:3000",
			"http://localhost:3001",
			"http://localhost:5173",
			"http://192.168.1.18:3000",
			"https://maestro-frontned-web.vercel.app",
			"https://maestro-done-baclend-web.vercel.app", // ✅ PRODUCTION FRONTEND
		],
		credentials: true,
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	})
);

app.options("*", (c) => {
	c.header(
		"Access-Control-Allow-Origin",
		"https://maestro-frontned-web.vercel.app"
	);
	c.header("Access-Control-Allow-Credentials", "true");
	c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
	c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
	return c.body(null, 204);
});

/* ================= AUTH ROUTES (FIXED) ================= */

app.all("/auth/*", async (c) => {
	const res = await auth.handler(c.req.raw);

	// Attach CORS headers manually
	res.headers.set(
		"Access-Control-Allow-Origin",
		"https://maestro-frontned-web.vercel.app"
	);
	res.headers.set("Access-Control-Allow-Credentials", "true");

	return res;
});

/* ================= AUTH MIDDLEWARE ================= */

//
app.get("/test-db", async (c) => {
	const db = getDatabase();
	await db.select().from(todos).limit(1);
	return c.json({ ok: true });
});

app.get("/", async (c) => {
	const db = getDatabase();
	const userId = c.get("userId");

	const data = await db.select().from(todos).where(eq(todos.userId, userId));

	return c.json(data);
});

/* ================= CREATE TODO ================= */

app.post("/", validator("json", todoFormSchema), async (c) => {
	const db = getDatabase();
	const userId = c.get("userId");
	const body = c.req.valid("json");

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

	return c.json({ success: true, data: todo }, 201);
});

/* ================= UPDATE TODO ================= */

app.put(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	validator("json", todoFormSchema),
	async (c) => {
		const db = getDatabase();
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const userId = c.get("userId");

		const startAt = new Date(`${body.startDate}T${body.startTime}`);
		const endAt = new Date(`${body.endDate}T${body.endTime}`);

		const [todo] = await db
			.update(todos)
			.set({ ...body, startAt, endAt })
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)))
			.returning();

		if (!todo) {
			return c.json({ message: "Not found" }, 404);
		}

		return c.json({ success: true, data: todo });
	}
);

/* ================= PATCH TODO ================= */

app.patch(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	validator("json", patchTodoSchema),
	async (c) => {
		const db = getDatabase();
		const { id } = c.req.valid("param");
		const body = c.req.valid("json");
		const userId = c.get("userId");

		const [todo] = await db
			.update(todos)
			.set(body)
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)))
			.returning();

		if (!todo) {
			return c.json({ message: "Not found" }, 404);
		}

		return c.json({ success: true, data: todo });
	}
);

/* ================= DELETE TODO ================= */

app.delete(
	"/:id",
	validator("param", z.object({ id: z.string() })),
	async (c) => {
		const db = getDatabase();
		const { id } = c.req.valid("param");
		const userId = c.get("userId");

		const result = await db
			.delete(todos)
			.where(and(eq(todos.id, Number(id)), eq(todos.userId, userId)));

		if (!result.rowCount) {
			return c.json({ message: "Not found" }, 404);
		}

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

/* ================= DOCS ================= */

app.get(
	"/docs",
	Scalar({
		url: "/api/openapi",
	})
);

export default handle(app);
