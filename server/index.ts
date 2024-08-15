import fs from "fs";
import path from "path";
import express from "express";
import getPort, { portNumbers } from "get-port";
import { ip as ipAddress } from "address";
import compression from "compression";
import chalk from "chalk";
import morgan from "morgan";
import { createServer as createViteServer } from "vite";
import { renderToPipeableStream } from "react-dom/server";
import App from "../src/App";

const app = express();

const getHost = (req: { get: (key: string) => string | undefined }) =>
  req.get("X-Forwarded-Host") ?? req.get("host") ?? "";

app.use((req, res, next) => {
  const proto = req.get("X-Forwarded-Proto");
  const host = getHost(req);
  if (proto === "http") {
    res.set("X-Forwarded-Proto", "https");
    res.redirect(`https://${host}${req.originalUrl}`);
    return;
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.endsWith("/") && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    const safepath = req.path.slice(0, -1);
    res.redirect(301, safepath + query);
  } else {
    next();
  }
});

app.use(compression());

app.disable("x-powerd-by");

app.use(
  "/build",
  express.static("public/build", { immutable: true, maxAge: "1y" })
);

app.use(
  "/fonts",
  express.static("public/fonts", { immutable: true, maxAge: "1y" })
);

app.use(express.static("public", { maxAge: "1y" }));

morgan.token("url", (req) => decodeURIComponent(req.url ?? ""));

const desiredPort = Number(process.env.PORT || 3000);

const portToUse = await getPort({
  port: portNumbers(desiredPort, desiredPort + 100),
});

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});

app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    let template = fs.readFileSync(
      path.resolve(__dirname, "/index.html"),
      "utf-8"
    );
    template = await vite.transformIndexHtml(url, template);
    const { render } = await vite.ssrLoadModule("/src/entry-server.js");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml);
    res.status(200).set({ "Content-Type": "text/html " }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.use(vite.middlewares);

app.use("/", (req, res, next) => {
  const { pipe } = renderToPipeableStream(<App />, {});
});

const server = app.listen(portToUse, () => {
  const addy = server.address();
  const portUsed =
    desiredPort === portToUse
      ? desiredPort
      : addy && typeof addy === "object"
      ? addy.port
      : 0;

  if (portUsed !== desiredPort) {
    console.warn(
      chalk.yellow(
        `⚠️  포트 번호 ${desiredPort} 는 사용 중입니다, 대신 ${portUsed} 포트를 사용합니다.`
      )
    );
  }

  console.log(chalk.bold(`🎉  서버가 실행 중입니다!`));
  const localUrl = `http://localhost:${portUsed}`;
  let lanUrl: string | null = null;
  const localIp = ipAddress() ?? "Unknown";

  if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1][.]|^192[.]168[.])/.test(localIp)) {
    lanUrl = `http://${localIp}:${portUsed}`;
  }

  const launchingMsg = `
  ${chalk.bold("Local:")}            ${chalk.cyan(localUrl)}
  ${lanUrl ? `${chalk.bold("On Your Network:")}  ${chalk.cyan(lanUrl)}` : ""}
  ${chalk.bold("Press Ctrl+C to Stop")}
  `;
  console.log(launchingMsg);
});
