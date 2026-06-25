import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".thumbnail": "image/webp",
};

export interface ServedSite {
  url: string;
  close: () => Promise<void>;
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}

function closer(server: Server): () => Promise<void> {
  return () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
}

/** Serve a directory statically. `indexFile` is returned for "/". */
export async function serveDirectory(dir: string, indexFile = "index.html"): Promise<ServedSite> {
  const root = normalize(dir);
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      if (rel === "/" || rel === "") rel = "/" + indexFile;
      const target = normalize(join(root, rel));
      if (!target.startsWith(root)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      const body = await readFile(target);
      res.setHeader(
        "content-type",
        MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}/`, close: closer(server) };
}

/**
 * Serve a single HTML document at "/", optionally backed by a static assets
 * directory for relative `src`/`href` references.
 */
export async function serveHtml(html: string, assetsDir?: string): Promise<ServedSite> {
  const root = assetsDir ? normalize(assetsDir) : null;
  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    if (path === "/" || path === "") {
      res.setHeader("content-type", MIME[".html"]!);
      res.end(html);
      return;
    }
    if (root) {
      try {
        const target = normalize(join(root, decodeURIComponent(path)));
        if (target.startsWith(root) && (await stat(target)).isFile()) {
          res.setHeader(
            "content-type",
            MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
          );
          res.end(await readFile(target));
          return;
        }
      } catch {
        /* fall through */
      }
    }
    res.statusCode = 404;
    res.end("not found");
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}/`, close: closer(server) };
}
