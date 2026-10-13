/**
 * 快速验证企业微信凭证：调用官方 gettoken（不经过本业务 API）。
 * 需在 .env 中配置 WEWORK_CORP_ID、WEWORK_CORP_SECRET（与运行时一致）。
 *
 * 说明：若仅在「参数设置」里保存了 wework.corp_id / wework.corp_secret（未写 .env），
 * 本脚本读不到库表，请用管理端「企业微信 → 同步日志」页的「从企微拉取通讯录」测试。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

const corpId = process.env.WEWORK_CORP_ID?.trim();
const secret = process.env.WEWORK_CORP_SECRET?.trim();

if (!corpId || !secret) {
  console.error(
    "未找到 WEWORK_CORP_ID / WEWORK_CORP_SECRET。\n" +
      "请在项目根目录 .env 中配置，或在管理端「系统 → 参数设置」保存企微项后再用页面按钮拉取。",
  );
  process.exit(1);
}

const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`;
const r = await fetch(url);
const j = await r.json();

if (j.errcode !== 0 || !j.access_token) {
  console.error("gettoken 失败:", JSON.stringify(j, null, 2));
  console.error("\n常见原因：Secret 不是「通讯录同步」或具备通讯录权限的应用；CorpId 错误；企业 IP 未加白名单等。");
  process.exit(1);
}

console.log("gettoken 成功。");
console.log("  access_token 前缀:", `${String(j.access_token).slice(0, 12)}…`);
console.log("  expires_in (秒):", j.expires_in ?? 7200);
console.log("\n下一步：启动后端后登录管理端，打开「企业微信 → 同步日志」，点击「从企微拉取通讯录」。");
