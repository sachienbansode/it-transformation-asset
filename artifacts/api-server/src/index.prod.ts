import { createProdApp } from "./app.prod";
import { logger } from "./lib/logger";
import { seedProductionDatabase } from "./seed-production";

const port = Number(process.env.PORT) || 8080;

if (Number.isNaN(port) || port <= 0) {
  console.error(`Invalid PORT: "${process.env.PORT}"`);
  process.exit(1);
}

const app = createProdApp();

// Always seed on production boot — skips gracefully if already populated
forceSeedProductionDatabase()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Failed to listen");
        process.exit(1);
      }
      logger.info({ port }, "Production server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Startup seed failed — aborting");
    process.exit(1);
  });
