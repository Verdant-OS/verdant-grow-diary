import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@playwright/test";
import { webkit } from "playwright-core";

/**
 * Point a GA spec's document host at verdantgrowdiary.com (#2693) while the
 * response bytes still come from this branch's dev server. Vite rejects that
 * Host, and the spec must not change an assertion to compensate.
 *
 * Chromium maps the name with --host-resolver-rules. WebKit has no such flag,
 * so each run bind-mounts a private hosts file in a user namespace. The
 * browser is the Playwright browserName fixture (the project's browserName, or
 * its defaultBrowserType). process.argv does not carry --project in the worker,
 * so it is not read.
 * This file never writes the machine /etc/hosts.
 */
const CHROMIUM_HOST_RESOLVER_RULES =
  "--host-resolver-rules=MAP verdantgrowdiary.com 127.0.0.1,MAP www.verdantgrowdiary.com 127.0.0.1";

const WEBKIT_RESOLVER_SCRIPT = `#!/bin/sh
set -eu
exec unshare --user --map-root-user --mount --propagation private sh -c 'mount --bind "$1" /etc/hosts && shift && exec "$@"' sh "$VERDANT_GA_HOSTS_FILE" "$VERDANT_WEBKIT_BIN" "$@"
`;

type CollectionBrowserName = "chromium" | "firefox" | "webkit";

type CollectionLaunchOptions = {
  args?: string[];
  executablePath?: string;
  env?: NodeJS.ProcessEnv;
};

let webkitCollectionHostSkip: string | undefined;

export function pointSpecAtGoogleAnalyticsCollectionHost(
  proxyPort: number,
  appPort = 5173,
): string {
  const origin = `http://verdantgrowdiary.com:${proxyPort}`;
  test.use({
    baseURL: origin,
    launchOptions: async ({ browserName }, apply) => {
      await apply(launchOptionsForCollectionHost(collectionBrowserName(browserName)));
    },
  });
  // Listen in the worker only. Playwright also loads this file to collect tests,
  // and a second bind on the same port fails. Resolving launchOptions here decides
  // the WebKit skip before any later hook launches the browser.
  test.beforeAll(({ browserName, launchOptions }) => {
    void launchOptions;
    if (browserName === "webkit" && webkitCollectionHostSkip)
      test.skip(true, webkitCollectionHostSkip);
  });
  test.beforeAll(async () => {
    await listenGaCollectionProxy(proxyPort, appPort);
  });
  return origin;
}

function collectionBrowserName(browserName: string): CollectionBrowserName {
  if (browserName === "chromium" || browserName === "firefox" || browserName === "webkit")
    return browserName;
  throw new Error(
    `GA collection host could not tell which browser this project launches (${browserName})`,
  );
}

function launchOptionsForCollectionHost(
  browserName: CollectionBrowserName,
): CollectionLaunchOptions {
  switch (browserName) {
    case "chromium":
      return { args: [CHROMIUM_HOST_RESOLVER_RULES] };
    case "webkit":
      return webKitCollectionHostLaunchOptions();
    case "firefox":
      return {};
    default: {
      const unexpected: never = browserName;
      throw new Error(`Unexpected browser ${String(unexpected)}`);
    }
  }
}

function webKitSkipReason(detail: string): string {
  return `WebKit per-run host resolver is unavailable (${detail}). --host-resolver-rules is Chromium-only, and this helper does not write /etc/hosts.`;
}

function webKitCollectionHostLaunchOptions(): CollectionLaunchOptions {
  if (process.platform !== "linux") {
    webkitCollectionHostSkip = webKitSkipReason("this process is not Linux");
    return {};
  }
  try {
    execFileSync(
      "unshare",
      ["--user", "--map-root-user", "--mount", "--propagation", "private", "true"],
      { stdio: "ignore" },
    );
  } catch {
    webkitCollectionHostSkip = webKitSkipReason(
      "a private user-namespace hosts mount did not start",
    );
    return {};
  }

  const hostsPath = join(tmpdir(), `verdant-ga-hosts-${process.pid}`);
  const scriptPath = join(tmpdir(), `verdant-ga-webkit-${process.pid}.sh`);
  const existing = readFileSync("/etc/hosts", "utf8");
  const mapping = [
    "127.0.0.1 verdantgrowdiary.com www.verdantgrowdiary.com",
    "::1 verdantgrowdiary.com www.verdantgrowdiary.com",
    "",
  ].join("\n");
  writeFileSync(
    hostsPath,
    existing.endsWith("\n") ? `${existing}${mapping}` : `${existing}\n${mapping}`,
  );
  writeFileSync(scriptPath, WEBKIT_RESOLVER_SCRIPT);
  chmodSync(scriptPath, 0o755);
  return {
    executablePath: scriptPath,
    env: {
      ...process.env,
      VERDANT_GA_HOSTS_FILE: hostsPath,
      VERDANT_WEBKIT_BIN: webkit.executablePath(),
    },
  };
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
