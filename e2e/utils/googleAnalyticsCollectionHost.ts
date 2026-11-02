import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { test } from "@playwright/test";

/**
 * Point a GA spec's document host at verdantgrowdiary.com (#2693) while the
 * response bytes still come from this branch's dev server. Vite rejects that
 * Host, and the spec must not change an assertion to compensate.
 */
export function pointSpecAtGoogleAnalyticsCollectionHost(
  proxyPort: number,
  appPort = 5173,
): string {
  ensureCollectionHostLoopback();
  const origin = `http://verdantgrowdiary.com:${proxyPort}`;
  test.use({
    baseURL: origin,
    ...(process.argv.some((arg) => arg.includes("webkit"))
      ? {}
      : {
          launchOptions: {
            args: [
              "--host-resolver-rules=MAP verdantgrowdiary.com 127.0.0.1,MAP www.verdantgrowdiary.com 127.0.0.1",
            ],
          },
        }),
  });
  // Listen in the worker only. Playwright also loads this file to collect tests,
  // and a second bind on the same port fails.
  test.beforeAll(async () => {
    await listenGaCollectionProxy(proxyPort, appPort);
  });
  return origin;
}

function ensureCollectionHostLoopback(): void {
  const lines = [
    "127.0.0.1 verdantgrowdiary.com www.verdantgrowdiary.com",
    "::1 verdantgrowdiary.com www.verdantgrowdiary.com",
  ];
  try {
    const current = readFileSync("/etc/hosts", "utf8");
    const missing = lines.filter((line) => !current.includes(line));
    if (missing.length === 0) return;
    execFileSync("sudo", ["-n", "tee", "-a", "/etc/hosts"], { input: `${missing.join("\n")}\n` });
  } catch {
    // Chromium maps the host with --host-resolver-rules when sudo is unavailable.
  }
}

function listenGaCollectionProxy(proxyPort: number, appPort: number): Promise<void> {
  const origin = `http://verdantgrowdiary.com:${proxyPort}`;
  const server = createServer((req, res) => {
    const headers = { ...req.headers, host: `127.0.0.1:${appPort}` };
    const proxyReq = httpRequest(
      {
        hostname: "127.0.0.1",
        port: appPort,
        method: req.method,
        path: req.url,
        headers,
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => {
          chunks.push(Buffer.from(chunk));
        });
        proxyRes.on("end", () => {
          const type = String(proxyRes.headers["content-type"] ?? "");
          const encoded = proxyRes.headers["content-encoding"];
          let body = Buffer.concat(chunks);
          if (!encoded && /text\/html|javascript|json|text\/css|text\/plain/.test(type)) {
            body = Buffer.from(
              body
                .toString("utf8")
                .replaceAll(`http://127.0.0.1:${appPort}`, origin)
                .replaceAll(`http://localhost:${appPort}`, origin)
                .replaceAll(`ws://127.0.0.1:${appPort}`, `ws://verdantgrowdiary.com:${proxyPort}`)
                .replaceAll(`ws://localhost:${appPort}`, `ws://verdantgrowdiary.com:${proxyPort}`),
            );
          }
          const responseHeaders = { ...proxyRes.headers };
          delete responseHeaders["content-length"];
          delete responseHeaders["transfer-encoding"];
          if (typeof responseHeaders.location === "string") {
            responseHeaders.location = responseHeaders.location
              .replaceAll(`http://127.0.0.1:${appPort}`, origin)
              .replaceAll(`http://localhost:${appPort}`, origin);
          }
          res.writeHead(proxyRes.statusCode ?? 502, responseHeaders);
          res.end(body);
        });
      },
    );
    proxyReq.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(proxyReq);
  });
  server.on("upgrade", (req, socket, head) => {
    const upstream = netConnect(appPort, "127.0.0.1", () => {
      const headers = { ...req.headers, host: `127.0.0.1:${appPort}` };
      let raw = `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/1.1\r\n`;
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        for (const item of Array.isArray(value) ? value : [value]) raw += `${key}: ${item}\r\n`;
      }
      raw += "\r\n";
      upstream.write(raw);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      server.unref();
      resolve();
    };
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") finish();
      else reject(error);
    });
    server.listen(proxyPort, () => {
      finish();
    });
  });
}
