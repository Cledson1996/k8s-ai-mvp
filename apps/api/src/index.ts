import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const app = await createApp();

try {
  await app.listen({
    host: "0.0.0.0",
    port: config.API_PORT
  });
  console.log(`API listening on http://localhost:${config.API_PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
