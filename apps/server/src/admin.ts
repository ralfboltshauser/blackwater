import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { BlackwaterStore } from "./persistence";
import { PersistedRulesSchema, WorkflowStateSchema } from "./state";

const dataDir = process.env.BLACKWATER_DATA_DIR ?? resolve("data");
const databaseFile = join(dataDir, "blackwater.sqlite3");
const [command = "doctor", ...arguments_] = process.argv.slice(2);

const store = BlackwaterStore.open({
  filename: databaseFile,
  rulesSchema: PersistedRulesSchema,
  workflowSchema: WorkflowStateSchema,
});

try {
  if (command === "doctor") {
    console.log(
      JSON.stringify(
        {
          status: store.quickCheck()[0] === "ok" ? "ok" : "failed",
          schemaVersion: store.schemaVersion,
          pragmas: store.pragmaState(),
          matches: store.listMatches().length,
          publicUrl: process.env.BLACKWATER_PUBLIC_URL ?? "request-derived",
          allowedCidrs: process.env.BLACKWATER_ALLOWED_CIDRS ?? "127.0.0.0/8",
        },
        null,
        2,
      ),
    );
  } else if (command === "backup") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reasonIndex = arguments_.indexOf("--reason");
    const reason =
      reasonIndex >= 0 ? (arguments_[reasonIndex + 1] ?? "manual") : "manual";
    const safeReason = reason.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
    const destination = join(
      dataDir,
      "backups",
      `blackwater-${timestamp}-${safeReason}.sqlite3`,
    );
    console.log(JSON.stringify(await store.backup(destination), null, 2));
  } else if (command === "backups" && arguments_[0] === "list") {
    const directory = join(dataDir, "backups");
    const files = await readdir(directory).catch(() => []);
    console.log(
      files
        .filter((file) => file.endsWith(".sqlite3"))
        .sort()
        .join("\n"),
    );
  } else {
    throw new Error(
      `Unknown admin command: ${command} ${arguments_.join(" ")}`,
    );
  }
} finally {
  store.close();
}
