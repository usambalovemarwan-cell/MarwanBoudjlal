// خادم غرف White Shooter — نفس بروتوكول lan_server.gd
const { WebSocketServer } = require("ws");
const http = require("http");

const PORT = process.env.PORT || 8080;
const WIN = 5, SPAWN_COUNT = 40, ARENAS = 5;
const rooms = new Map();

const httpServer = http.createServer((req, res) => { res.end("White Shooter server OK"); });
const wss = new WebSocketServer({ server: httpServer });

const send = (c, d) => { if (c.readyState === 1) c.send(JSON.stringify(d)); };
const rnd = n => Math.floor(Math.random() * n);
const newCode = () => {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c;
  do { c = Array.from({ length: 4 }, () => L[rnd(L.length)]).join(""); } while (rooms.has(c));
  return c;
};

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter(p => p !== ws);
  room.score = [0, 0]; room.ready = [false, false]; room.alive = false;
  room.players.forEach(p => send(p, { t: "left" }));
  if (room.players.length === 0) rooms.delete(room.code);
}

function startRound(room) {
  room.alive = true; room.n++;
  const a = rnd(SPAWN_COUNT), off = 1 + rnd(2);
  room.players.forEach((p, i) =>
    send(p, { t: "round", n: room.n, a, off, first: i === 0, score: room.score }));
}

wss.on("connection", ws => {
  ws.room = null;
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    const room = ws.room;
    switch (m.t) {
      case "create": {
        leave(ws);
        const code = newCode();
        const r = { code, players: [ws], score: [0, 0], ready: [false, false], n: 0, alive: false, arena: 0 };
        rooms.set(code, r); ws.room = r;
        send(ws, { t: "created", code });
        break;
      }
      case "join": {
        const r = rooms.get(String(m.code || "").toUpperCase());
        if (!r) return send(ws, { t: "error", msg: "Room not found" });
        if (r.players.length >= 2) return send(ws, { t: "error", msg: "Room full" });
        r.players.push(ws); ws.room = r;
        r.score = [0, 0]; r.ready = [false, false]; r.arena = rnd(ARENAS);
        r.players.forEach((p, i) => send(p, { t: "start", you: i, map: "lonewolf", arena: r.arena }));
        break;
      }
      case "ready": {
        if (!room || room.players.length < 2) return;
        room.ready[room.players.indexOf(ws)] = true;
        if (room.ready[0] && room.ready[1]) { room.ready = [false, false]; startRound(room); }
        break;
      }
      case "state": case "shot":
        if (room) room.players.filter(p => p !== ws).forEach(p => send(p, m));
        break;
      case "hit":
        if (room) room.players.filter(p => p !== ws)
          .forEach(p => send(p, { t: "hit", dmg: Number(m.dmg) || 0 }));
        break;
      case "dead": {
        if (!room || !room.alive) return;
        room.alive = false;
        const me = room.players.indexOf(ws);
        room.score[1 - me]++;
        const done = room.score[1 - me] >= WIN;
        room.players.forEach(p => send(p, { t: "point", score: room.score, winner: done ? 1 - me : -1 }));
        setTimeout(() => {
          if (done) room.score = [0, 0];
          if (room.players.length !== 2) return;
          // ساحة جديدة بعد كل نقطة (فوز أو خسارة)، والنتيجة تبقى حتى 5
          room.arena = (room.arena + 1 + rnd(ARENAS - 1)) % ARENAS;
          room.ready = [false, false];
          room.players.forEach(p => send(p, { t: "arena", i: room.arena }));
        }, done ? 3000 : 1800);
        break;
      }
    }
  });
  ws.on("close", () => leave(ws));
  ws.on("error", () => leave(ws));
});

httpServer.listen(PORT, () => console.log("Server on port " + PORT));
