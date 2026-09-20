import { readFile } from "node:fs/promises";

const manifest = new URL("../dist/.openai/hosting.json", import.meta.url);
JSON.parse(await readFile(manifest, "utf8"));
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (typeof worker.default?.fetch !== "function") {
  throw new Error("dist/server/index.js must export default.fetch");
}
console.log("Validated Sites Worker and hosting manifest.");
