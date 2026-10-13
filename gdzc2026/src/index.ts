import { buildApp } from "./app.js";
import { startBackgroundSchedulers } from "./services/schedulerService.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

await startBackgroundSchedulers();
const app = await buildApp();
await app.listen({ port, host });
console.log(`listening on http://${host}:${port}`);
