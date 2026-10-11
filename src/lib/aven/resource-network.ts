import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    return (
      /^[23]/.test(lower) &&
      !lower.startsWith("2001:db8:") &&
      !lower.startsWith("2001:0:") &&
      !lower.startsWith("2001::") &&
      !lower.startsWith("2002:")
    );
  }
  return false;
}
/** Resolve once and pin the HTTPS connection. Never forward cookies or follow redirects. */
export async function readLearningLink(
  raw: string,
): Promise<{ contentsRead: boolean; text?: string; reason?: string }> {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    return {
      contentsRead: false,
      reason: "Only public HTTPS learning pages are processed.",
    };
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(
        () => reject(new Error("resourceUnavailable")),
        4000,
      );
    }),
  ]).finally(() => {
    if (dnsTimer) clearTimeout(dnsTimer);
  });
  if (
    !addresses.length ||
    addresses.some((value) => !publicAddress(value.address))
  )
    return {
      contentsRead: false,
      reason: "The resource address is not public.",
    };
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const pending = request(
      url,
      {
        method: "GET",
        family: address.family,
        headers: {
          Accept: "text/html,text/plain",
          "Accept-Encoding": "identity",
          "User-Agent": "Acadence-Aven/1.0",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        if (
          response.statusCode !== 200 ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity") ||
          !/^(text\/html|text\/plain)/i.test(
            String(response.headers["content-type"] ?? ""),
          )
        ) {
          response.resume();
          resolve({
            contentsRead: false,
            reason:
              "The page returned a redirect, error or unsupported content type.",
          });
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 500000) pending.destroy(new Error("resourceTooLarge"));
          else chunks.push(chunk);
        });
        response.on("end", () => {
          const html = Buffer.concat(chunks).toString("utf8");
          const text = html
            .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 14000);
          resolve({ contentsRead: Boolean(text), text });
        });
        response.on("error", reject);
      },
    );
    const timeout = setTimeout(
      () => pending.destroy(new Error("resourceUnavailable")),
      4000,
    );
    pending.on("close", () => clearTimeout(timeout));
    pending.on("error", reject);
    pending.end();
  });
}
