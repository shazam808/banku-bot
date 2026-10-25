const encoder = new TextEncoder();
const HEX = /^[0-9a-f]+$/i;

export function hexBytes(value: string): Uint8Array | null {
  if (value.length % 2 || !HEX.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16));
}

export async function verifyDiscordRequest(
  body: Uint8Array,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
  now = Date.now(),
): Promise<boolean> {
  if (
    !signature || !timestamp || !/^\d{10}$/.test(timestamp) ||
    !/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  ) return false;
  const keyBytes = hexBytes(publicKey);
  const signatureBytes = hexBytes(signature);
  if (!keyBytes || !signatureBytes) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const message = new Uint8Array(encoder.encode(timestamp).length + body.length);
    message.set(encoder.encode(timestamp));
    message.set(body, timestamp.length);
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      signatureBytes as BufferSource,
      message as BufferSource,
    );
  } catch {
    return false;
  }
}

export async function signBankuRequest(
  secret: string,
  body: string,
  nonce: string,
  timestamp: string,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(body));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const message = `POST\n/api/bot/v1\n${timestamp}\n${nonce}\n${hash}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
