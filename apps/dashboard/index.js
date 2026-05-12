import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = Number.parseInt(process.env.LMS_DASHBOARD_PORT ?? "3001", 10);
const MAX_HISTORY = 500;
const history = [];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

wss.on("connection", (client) => {
  client.send(JSON.stringify({
    event: "DASHBOARD_HISTORY",
    timestamp: new Date().toISOString(),
    data: { events: history },
  }));
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    clients: wss.clients.size,
    retainedEvents: history.length,
  });
});

app.post("/telemetry", (req, res) => {
  const payload = {
    id: randomUUID(),
    event: req.body?.event ?? "UNKNOWN",
    timestamp: req.body?.timestamp ?? new Date().toISOString(),
    data: req.body?.data ?? {},
  };

  history.push(payload);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  res.status(204).end();
});

server.listen(PORT, () => {
  console.log(`\nDashboard running at http://localhost:${PORT}`);
  console.log(`Telemetry endpoint: http://localhost:${PORT}/telemetry\n`);
});
