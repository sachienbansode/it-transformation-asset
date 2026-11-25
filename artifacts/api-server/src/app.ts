import { friendlyErrors } from "./lib/friendly-errors";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

export async function createApp(): Promise<Express> {
  const app: Express = express();
  app.set("trust proxy", 1); // behind nginx: lets the secure session cookie be set over HTTPS
  app.disable("x-powered-by");   // VAPT: do not advertise the framework

  // VAPT (ITH-131): only the HTTP methods the app uses. Pages: GET / HEAD. API: GET, HEAD, POST, PUT, PATCH, DELETE.
  // OPTIONS is answered only as a CORS pre-flight from an allowed origin (no "Allow" list is ever advertised); TRACE / TRACK never.
  app.use((req, res, next) => {
    const m = req.method; const api = req.path.startsWith("/api/") || req.path === "/api";
    if (m === "OPTIONS") {
      if (api && req.headers.origin && req.headers["access-control-request-method"]) return next();   // pre-flight → cors() below decides
      res.status(405).end(); return;
    }
    if (m === "GET" || m === "HEAD") return next();
    if (api && ["POST", "PUT", "PATCH", "DELETE"].includes(m)) return next();
    res.status(405).end();
  });

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  const itsmRateLimiter = new Map<string, { count: number; ts: number }>();
  const RATE_LIMITED_PATHS = ["/api/incidents", "/api/problems", "/api/changes", "/api/sla-policies", "/api/knowledge-base", "/api/service-requests"];
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    const isRateLimited = RATE_LIMITED_PATHS.some(p => req.path.startsWith(p));
    if (!isRateLimited) return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const entry = itsmRateLimiter.get(key);
    if (!entry || now - entry.ts > 1000) {
      itsmRateLimiter.set(key, { count: 1, ts: now });
      return next();
    }
    entry.count++;
    if (entry.count > 10) {
      res.status(429).end();
      return;
    }
    next();
  });
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of itsmRateLimiter) {
      if (now - v.ts > 5000) itsmRateLimiter.delete(k);
    }
  }, 10000);

  // Security headers on every response (HTTPS only, no framing by other sites, no MIME sniffing)
  const prod = process.env.NODE_ENV === "production";
  app.use((req, res, next) => {
    if (prod) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  // API only over HTTPS in production (the local health check on the server itself is allowed)
  app.use("/api", (req, res, next) => {
    if (!prod || req.secure) return next();
    const ip = req.socket.remoteAddress || "";
    if (/^(127\.|::1$|::ffff:127\.)/.test(ip)) return next();
    res.status(426).json({ error: "IT Hub only accepts HTTPS connections" });
  });
  // Browsers may call the API only from IT Hub's own address (APP_URL, plus CORS_ORIGINS if set)
  const allowed = [process.env.APP_URL, ...(process.env.CORS_ORIGINS || "").split(",")].map(o => String(o || "").trim().replace(/\/$/, "")).filter(Boolean)
    .map(o => { try { return new URL(o).origin; } catch { return null; } }).filter(Boolean) as string[];
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || (allowed.length ? allowed.includes(origin) : !prod)),   // production without APP_URL: same-origin only
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }));
  // ITH-091: keep the exact bytes of device-agent requests so their signature can be checked; agents may send at most 5 MB
  app.use("/api/agent/", express.json({ limit: "5mb", verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const PgSession = connectPgSimple(session);

  app.use(session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    name: "ashika.sid",
    secret: process.env.SESSION_SECRET || "ashika-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 4 * 60 * 60 * 1000,   // r98: 4 hours by default; each sign-in applies Admin › Settings › Session timeout
      sameSite: "lax",
    },
  }));

  // r92: records are never deleted in any module — masters and set-up lists are deactivated instead.
  // Only links and personal items can be removed (unlink, end a delegation, dismiss a notification, archive a KPI set, revoke a key).
  const DELETE_OK = [/^\/notifications\//, /^\/push\//, /^\/roles\/\d+\/users\//, /^\/asset-contracts\/\d+\/assets\//, /^\/itsm-links\//,
    /^\/approval-delegates\//, /^\/compliance-references\//, /^\/kpi-sets\//, /^\/asset-agent-codes\//, /^\/auth\//];
  app.use("/api", (req, res, next) => {
    const deact = req.method === "POST" && /^\/(asset-vendors|sla-policies|knowledge-base|approval-matrix)\/\d+\/deactivate$/.test(req.path);
    if (deact) { req.method = "DELETE"; req.url = req.url.replace("/deactivate", ""); return next(); }   // these "delete" handlers only switch the record off
    if (req.method !== "DELETE" || DELETE_OK.some(r => r.test(req.path))) return next();
    res.status(405).json({ error: "Deleting is not allowed — deactivate, cancel or close the record instead" });
  });
  app.use("/api", friendlyErrors, router);

  if (process.env.NODE_ENV === "production") {
    // Production: serve the pre-built React frontend as static files
    const distPath = path.resolve(__dirname, "../../it-transformation/dist/public");
    // r100: index.html is never cached (so a new version shows straight after a deploy); hashed /assets files are cached for a year
    app.use(express.static(distPath, { redirect: false, index: false, setHeaders: (res, p) => {
      if (/[\\/]assets[\\/]/.test(p)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      else res.setHeader("Cache-Control", "no-cache");
    } }));   // no /assets → /assets/ redirect (clashes with the Asset Dashboard route)
    app.use(/(.*)/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    // Development: run Vite dev server as Express middleware (single port, HMR included)
    const { createServer: createViteServer } = await import("vite");
    const viteConfigFile = path.resolve(__dirname, "../../it-transformation/vite.config.ts");
    const vite = await createViteServer({
      configFile: viteConfigFile,
      server: { middlewareMode: true },
      appType: "spa",
      clearScreen: false,
    });
    app.use(vite.middlewares);
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal server error";
    if (!res.headersSent) {
      res.status(status).json({ error: message });
    }
  });

  return app;
}
