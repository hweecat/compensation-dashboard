const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(workspaceRoot, "src/styles");
const outputPaths = [
  path.join(workspaceRoot, "styles.css"),
  path.join(workspaceRoot, "outputs/compensation-dashboard/styles.css"),
];

const files = fs
  .readdirSync(sourceRoot)
  .filter((file) => file.endsWith(".css"))
  .sort();

if (!files.length) {
  throw new Error("No component CSS files found in src/styles");
}

const stylesheet = files
  .map((file) => fs.readFileSync(path.join(sourceRoot, file), "utf8").replace(/\r\n/g, "\n").trimEnd())
  .join("\n\n") + "\n";

outputPaths.forEach((outputPath) => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, stylesheet);
});
