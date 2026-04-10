import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

app.use(cors({
  origin: true,
  credentials: true,
}));
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
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    sameSite: "lax",
  },
}));

app.use("/api", router);

// In production: serve the React frontend as static files
// (api-server builds and serves the frontend too, keeping a single port)
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve("artifacts/it-transformation/dist/public");
  app.use(express.static(distPath));
  app.use(/(.*)/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

export default app;
