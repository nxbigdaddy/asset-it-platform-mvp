/**
 * 在开发环境下用系统默认浏览器打开前端登录页（Vite 默认 5173）。
 * 由 npm run dev:open 在 wait-on 检测到端口就绪后调用。
 */
import { exec } from "node:child_process";
import { platform } from "node:os";

const port = process.env.VITE_DEV_PORT || "5173";
const url = `http://127.0.0.1:${port}/login`;

const os = platform();
if (os === "win32") {
  exec(`cmd /c start "" "${url}"`, (err) => {
    if (err) console.error("[open-dev-login]", err.message);
    else console.log("[open-dev-login] 已打开", url);
  });
} else if (os === "darwin") {
  exec(`open "${url}"`, (err) => {
    if (err) console.error("[open-dev-login]", err.message);
    else console.log("[open-dev-login] 已打开", url);
  });
} else {
  exec(`xdg-open "${url}"`, (err) => {
    if (err) console.error("[open-dev-login]", err.message);
    else console.log("[open-dev-login] 已打开", url);
  });
}
