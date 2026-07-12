import { createApplication, configFromEnvironment } from "./app";

const application = await createApplication(configFromEnvironment());

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  application.fastify.log.info({ signal }, "Blackwater is shutting down");
  try {
    await application.close();
    process.exitCode = 0;
  } catch (error) {
    application.fastify.log.error(error, "Graceful shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await application.start();
application.fastify.log.info(
  { address: application.fastify.server.address() },
  "Blackwater is ready",
);
