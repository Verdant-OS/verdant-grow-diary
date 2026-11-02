import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { connect as netConnect, type Socket } from "node:net";
import { test } from "@playwright/test";

/**
 * Point a GA spec's document host at verdantgrowdiary.com (#2693) while the
 * response bytes still come from this branch's dev server. Vite rejects that
 * Host, and the spec must not change an assertion to compensate.
 *
 * Chromium maps the name with --host-resolver-rules. WebKit has no such flag,
 * and GitHub-hosted runners refuse the user namespace a private /etc/hosts
 * mount needs. WebKit therefore uses this file's local forward proxy: the
 * document URL stays on the diary host, and the proxy fetches the dev server.
 * The browser is the Playwright browserName fixture (the project's browserName,
 * or its defaultBrowserType). process.argv does not carry --project in the
 * worker, so it is not read.
 * This file never writes the machine /etc/hosts and never skips a spec.
 */
const CHROMIUM_HOST_RESOLVER_RULES =
  "--host-resolver-rules=MAP verdantgrowdiary.com 127.0.0.1,MAP www.verdantgrowdiary.com 127.0.0.1";

const DIARY_HOSTS = new Set(["verdantgrowdiary.com", "www.verdantgrowdiary.com"]);

type CollectionBrowserName = "chromium" | "firefox" | "webkit";

type CollectionLaunchOptions = {
  args?: string[];
  proxy?: { server: string };
};

type ForwardTarget = {
  hostname: string;
  port: number;
  path: string;
  diary: boolean;
};

export function pointSpecAtGoogleAnalyticsCollectionHost(
  proxyPort: number,
  appPort = 5173,
): string {
  const origin = `http://verdantgrowdiary.com:${proxyPort}`;
  test.use({
    baseURL: origin,
    launchOptions: async ({ browserName }, apply) => {
      await apply(launchOptionsForCollectionHost(collectionBrowserName(browserName), proxyPort));
    },
  });
  // Listen in the worker only. Playwright also loads this file to collect tests,
  // and a second bind on the same port fails. The browser launches after this hook.
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
  proxyPort: number,
): CollectionLaunchOptions {
  switch (browserName) {
    case "chromium":
      return { args: [CHROMIUM_HOST_RESOLVER_RULES] };
    case "webkit":
      return { proxy: { server: `http://127.0.0.1:${proxyPort}` } };
    case "firefox":
      return {};
    default: {
      const unexpected: never = browserName;
      throw new Error(`Unexpected browser ${String(unexpected)}`);
    }
  }
}

function isDiaryHost(hostname: string): boolean {
  return DIARY_HOSTS.has(hostname.replace(/\.$/, "").toLowerCase());
}

function isOwnProxy(hostname: string, port: number, proxyPort: number): boolean {
  const name = hostname.replace(/\.$/, "").toLowerCase();
  return (name === "127.0.0.1" || name === "localhost") && port === proxyPort;
}

function forwardTarget(
  rawUrl: string | undefined,
  appPort: number,
  proxyPort: number,
): ForwardTarget | null {
  const raw = rawUrl && rawUrl.length > 0 ? rawUrl : "/";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return { hostname: "127.0.0.1", port: appPort, path: raw, diary: true };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:" || url.protocol === "wss:"
      ? 443
      : 80;
  const path = `${url.pathname}${url.search}`;
  if (isDiaryHost(url.hostname) || isOwnProxy(url.hostname, port, proxyPort)) {
    return { hostname: "127.0.0.1", port: appPort, path, diary: true };
  }
  return { hostname: url.hostname, port, path, diary: false };
}

function connectTarget(
  raw: string | undefined,
  proxyPort: number,
): { hostname: string; port: number } | "loop" | null {
  if (!raw) return null;
  const colon = raw.lastIndexOf(":");
  if (colon <= 0) return null;
  const hostname = raw.slice(0, colon).trim();
  const port = Number(raw.slice(colon + 1));
  if (!hostname || !Number.isInteger(port) || port <= 0) return null;
  if (isOwnProxy(hostname, port, proxyPort) || (isDiaryHost(hostname) && port === proxyPort))
    return "loop";
  return { hostname, port };
}

function listenGaCollectionProxy(proxyPort: number, appPort: number): Promise<void> {
  const origin = `http://verdantgrowdiary.com:${proxyPort}`;
  const server = createServer((req, res) => {
    const target = forwardTarget(req.url, appPort, proxyPort);
    if (!target) {
      res.writeHead(400);
      res.end();
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    if (target.diary) headers.host = `127.0.0.1:${appPort}`;
    const proxyReq = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: target.path,
        headers,
      },
      (proxyRes) => {
        if (!target.diary) {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
          return;
        }
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
  server.on("connect", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const target = connectTarget(req.url, proxyPort);
    if (target === "loop" || target === null) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      return;
    }
    const upstream = netConnect(target.port, target.hostname, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    const closeBoth = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on("error", closeBoth);
    socket.on("error", closeBoth);
  });
  server.on("upgrade", (req, socket, head) => {
    const target = forwardTarget(req.url, appPort, proxyPort);
    if (!target) {
      socket.destroy();
      return;
    }
    const upstream = netConnect(target.port, target.hostname, () => {
      const headers = { ...req.headers, host: `${target.hostname}:${target.port}` };
      if (target.diary) headers.host = `127.0.0.1:${appPort}`;
      let raw = `${req.method ?? "GET"} ${target.path} HTTP/1.1\r\n`;
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
