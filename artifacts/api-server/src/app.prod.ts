import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

// Pure production app — zero Vite imports, serves pre-built static frontend
export function createProdApp(): Express {
  const app: Express = express();

  // Tell Express to trust Replit's HTTPS proxy so req.secure is true,
  // which allows secure:true session cookies to be sent correctly
  app.set("trust proxy", 1);

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

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      name: "ashika.sid",
      secret: process.env.SESSION_SECRET || "ashika-prod-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: true,
        maxAge: 8 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    }),
  );

  app.use("/api", router);

  // Serve the pre-built React frontend
  // __dirname is set by esbuild banner to the directory of this compiled file
  const distPath = path.resolve(__dirname, "../../it-transformation/dist/public");
  app.use(express.static(distPath, { index: false }));
  app.use(/(.*)/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  return app;
}
