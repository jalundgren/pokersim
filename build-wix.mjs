import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const htmlPath = path.join(dist, "index.html");
const cssPath = path.join(dist, "styles.css");
const jsPath = path.join(dist, "app.js");
const outputPath = path.join(dist, "wix.html");

const css = fs.readFileSync(cssPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");
let html = fs.readFileSync(htmlPath, "utf8");

html = html.replace(
  '  <link rel="stylesheet" href="styles.css">',
  `  <style>\n${css}\n  </style>`,
);
html = html.replace(
  '  <script src="app.js"></script>',
  `  <script>\n${js.replaceAll("</script>", "<\\/script>")}\n  </script>`,
);

if (html.includes('href="styles.css"') || html.includes('src="app.js"')) {
  throw new Error("External application assets remain in wix.html");
}

fs.writeFileSync(outputPath, html);
console.log(outputPath);
