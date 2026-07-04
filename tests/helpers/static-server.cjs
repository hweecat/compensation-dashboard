const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".mjs")) return "text/javascript";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function serveStatic(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const rewrites = options.rewrites || {};
  const virtualFiles = options.virtualFiles || {};
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (Object.prototype.hasOwnProperty.call(virtualFiles, url.pathname)) {
      res.writeHead(200, { "content-type": contentType(url.pathname) });
      res.end(virtualFiles[url.pathname]);
      return;
    }
    const requestPath = rewrites[url.pathname] || (url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.resolve(root, `.${decodeURIComponent(requestPath)}`);

    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { serveStatic };
