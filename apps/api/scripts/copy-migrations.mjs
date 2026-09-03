import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "src", "db", "migrations");
const destination = join(process.cwd(), "dist", "db", "migrations");

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

