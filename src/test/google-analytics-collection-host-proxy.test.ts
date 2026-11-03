import { createServer, request as httpRequest, type Server } from "node:http";
import { connect as netConnect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  GA_COLLECTION_PROXY_BIND_HOST,
  GA_PROXY_EXTERNAL_ALLOWLIST,
  startGaCollectionProxy,
} from "../../e2e/utils/googleAnalyticsCollectionHost";

/**
 * The GA collection proxy may rewrite the diary hosts onto the local dev
 * server. Every other destination, including loopback and private addresses,
 * is refused before a socket is opened.
 */

const open: Server[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => closeServer(server)));
});

describe("GA collection proxy relay", () => {
  it("listens on 127.0.0.1 and keeps the external allowlist empty", async () => {
    expect([...GA_PROXY_EXTERNAL_ALLOWLIST]).toEqual([]);
    const app = await listenApp();
    const proxy = await startGaCollectionProxy(0, portOf(app));
    open.push(proxy, app);
    const address = proxy.address();
    expect(address).toMatchObject({ address: GA_COLLECTION_PROXY_BIND_HOST });
    expect(GA_COLLECTION_PROXY_BIND_HOST).toBe("127.0.0.1");
  });

  it("rewrites a diary document onto the local app and refuses other targets", async () => {
    let appHits = 0;
    const app = await listenApp((url) => {
      appHits += 1;
      return `app:${url ?? ""}`;
    });
    const appPort = portOf(app);
    const proxy = await startGaCollectionProxy(0, appPort);
    open.push(proxy, app);
    const proxyPort = portOf(proxy);

    const diary = await proxyRequest(proxyPort, `http://verdantgrowdiary.com:${proxyPort}/diary`);
    const www = await proxyRequest(proxyPort, "http://www.verdantgrowdiary.com/www");
    const pathForm = await proxyRequest(proxyPort, "/path");
    expect(diary).toEqual({ status: 200, body: "app:/diary" });
    expect(www).toEqual({ status: 200, body: "app:/www" });
    expect(pathForm).toEqual({ status: 200, body: "app:/path" });
    expect(appHits).toBe(3);

    const refused = [
      `http://127.0.0.1:${appPort}/secret`,
      "http://localhost:9/secret",
      "http://192.168.1.5/secret",
      "http://10.0.0.5/secret",
      "http://169.254.169.254/latest",
      "http://example.com/secret",
      "http://[::1]/secret",
    ];
    for (const target of refused) {
      const response = await proxyRequest(proxyPort, target);
      expect(response.status, target).toBe(403);
    }
    expect(appHits).toBe(3);

    const connectRefused = [
      `127.0.0.1:${appPort}`,
      "localhost:22",
      "192.168.0.8:80",
      "example.com:443",
      "www.googletagmanager.com:443",
      `verdantgrowdiary.com:${proxyPort}`,
      "[::1]:443",
    ];
    for (const target of connectRefused) {
      const status = await proxyConnect(proxyPort, target);
      expect(status, target).toBe(403);
    }
    expect(appHits).toBe(3);
  });
});

function listenApp(bodyFor?: (url: string | undefined) => string): Promise<Server> {
  const server = createServer((req, res) => {
    const body = bodyFor ? bodyFor(req.url) : "ok";
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function portOf(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server has no port");
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function proxyRequest(
  proxyPort: number,
  target: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port: proxyPort, path: target, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function proxyConnect(proxyPort: number, target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = netConnect(proxyPort, "127.0.0.1", () => {
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
    });
    let raw = "";
    socket.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      const match = /^HTTP\/1\.[01] (\d+)/.exec(raw);
      if (match) {
        socket.end();
        resolve(Number(match[1]));
      }
    });
    socket.on("error", reject);
  });
}
