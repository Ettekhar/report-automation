import fs from "node:fs";
import path from "node:path";

const targetFile = path.resolve("node_modules/@opennextjs/cloudflare/dist/cli/build/open-next/compile-env-files.js");

if (fs.existsSync(targetFile)) {
  const original = fs.readFileSync(targetFile, "utf8");
  // Replace appendFileSync loop with a clean writeFileSync
  const patched = original.replace(
    /\["production", "development", "test"\]\.forEach\(\(mode\) => fs\.appendFileSync\([\s\S]*?\)\);/,
    `const content = ["production", "development", "test"].map((mode) => "export const " + mode + " = " + JSON.stringify(extractProjectEnvVars(mode, buildOpts)) + ";\\n").join("");\n    fs.writeFileSync(path.join(envDir, "next-env.mjs"), content);`
  );
  if (patched !== original) {
    fs.writeFileSync(targetFile, patched, "utf8");
    console.log("Successfully patched @opennextjs/cloudflare compile-env-files.js");
  }
}
