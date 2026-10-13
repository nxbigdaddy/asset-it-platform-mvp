import crypto from "node:crypto";

/** 与明文区分的前缀；未配置密钥时凭据仍以明文存库（兼容旧数据） */
const PREFIX = "enc1:";

function getKeyFromEnv(): Buffer | null {
  const hex = process.env.SERVER_CREDENTIAL_KEY?.trim();
  if (!hex || hex.length !== 64) return null;
  try {
    return Buffer.from(hex, "hex");
  } catch {
    return null;
  }
}

/** 写入数据库前调用：配置了 SERVER_CREDENTIAL_KEY（64 位十六进制 = 32 字节）则加密 */
export function sealCredential(plain: string): string {
  const key = getKeyFromEnv();
  if (!key) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const buf = Buffer.concat([iv, tag, enc]);
  return PREFIX + buf.toString("base64");
}

/** 读取连接密码时调用 */
export function revealCredential(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = getKeyFromEnv();
  if (!key) {
    throw new Error("凭据已加密（enc1:），但未配置有效的 SERVER_CREDENTIAL_KEY（64 位十六进制）");
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  if (raw.length < 12 + 16) throw new Error("凭据密文损坏");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
