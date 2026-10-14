// Cloudflare Worker: proxy chat cho game Vo Lam Idle.
// Chat server nguon (volam.vinarpg.com) khong tra CORS header, nen browser/WebView
// goi truc tiep bi chan. Worker nay proxy same-origin /api/chat/* ve nguon va them CORS.
// Path con lai -> ASSETS.fetch (giu nguyen hanh vi assets-only).

const UPSTREAM = "https://volam.vinarpg.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Chat-GM-Token",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The Gioi multiplayer: WebSocket /mp -> Durable Object MpRoom (1 instance/room,
    // room key = che do dang choi, vd field:12:standard — xem mpworld.ts roomKey()).
    if (url.pathname === "/mp") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response(JSON.stringify({ mp: true, rooms: "dynamic", ts: Date.now() }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
      const room = url.searchParams.get("room") || "field:1:standard";
      const id = env.MP_ROOM.idFromName(room);
      return env.MP_ROOM.get(id).fetch(request);
    }
    // Proxy /api/chat/* (chat the gioi) va /api/rankings* (bang xep hang —
    // cung nguon server, gom profile tu presence cua moi player).
    const isProxied = url.pathname.startsWith("/api/chat/") || url.pathname.startsWith("/api/rankings");

    // Preflight: tra 204 luon, khong len upstream.
    if (request.method === "OPTIONS" && isProxied) {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Path khong phai chat/rankings -> assets nhu cu.
    if (!isProxied) return env.ASSETS.fetch(request);

    // Build URL dich: giu nguyen pathname + search.
    const target = new URL(url.pathname + url.search, UPSTREAM);
    const headers = new Headers();
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers.set("Content-Type", contentType);
    // Forward token GM neu client gui.
    const gmToken = request.headers.get("X-Chat-GM-Token");
    if (gmToken) headers.set("X-Chat-GM-Token", gmToken);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      // POST co body; GET/DELETE khong co.
      body: request.method === "POST" ? request.body : undefined,
    });

    // Copy header tu upstream (giu content-type text/event-stream, retry: cua SSE), them CORS.
    const outHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS)) outHeaders.set(key, value);

    // Pipe body streaming nguyen ven.
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};

/* ======================= MpRoom — Durable Object 1 room The Gioi =======================
   Giao thuc JSON-WS 12 message giong client mpworld.ts (move/profile/pk_mode/pk_attack/
   pk_death/murder/welcome/leave...). Server la nguon chan ly cho MAN AP: khi nhan pk_death
   (nan vai bao da chet vi nguoi choi), cong diem cho tan cong +1, moi diem 10 phut (decay
   cuoi hang). PK thuong: chi danh nguoi da bat PK; Do Sat: danh moi nguoi cung room.
   Luu trang thai trong SQLite cua DO (song song voi hibernation). */
const MURDER_MS = 10 * 60 * 1000;

export class MpRoom {
  constructor(state, env) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT, faction TEXT, level INTEGER, pk INTEGER, mass INTEGER, murder INTEGER, murder_decay INTEGER)"
    );
  }

  rows() {
    return [...this.sql.exec("SELECT id, name, faction, level, pk, mass, murder, murder_decay FROM players")];
  }
  rowOf(id) {
    return this.sql.exec("SELECT id, name, faction, level, pk, mass, murder, murder_decay FROM players WHERE id = ?", id).toArray()[0] || null;
  }
  socketOf(id) {
    for (const ws of this.state.getWebSockets()) {
      if (this.state.getTags(ws)[0] === id) return ws;
    }
    return null;
  }
  broadcast(obj, exceptId = null) {
    const data = JSON.stringify(obj);
    for (const ws of this.state.getWebSockets()) {
      if (exceptId && this.state.getTags(ws)[0] === exceptId) continue;
      try { ws.send(data); } catch (e) { /* socket mat: close se don */ }
    }
  }
  // man ap hieu dung: moi diem 10 phut, het thoi gian thi ve 0
  effMurder(row) {
    if (!row || !row.murder) return { count: 0, decay: 0 };
    const left = row.murder_decay - Date.now();
    if (left <= 0) return { count: 0, decay: 0 };
    return { count: Math.min(99, row.murder), decay: row.murder_decay };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const cid = url.searchParams.get("cid") || crypto.randomUUID();
    this.state.acceptWebSocket(pair[1], [cid]);
    this.sql.exec("DELETE FROM players WHERE id = ?", cid);
    this.sql.exec("INSERT INTO players (id, name, faction, level, pk, mass, murder, murder_decay) VALUES (?, '', '', 1, 0, 0, 0, 0)", cid);

    const self = this.rowOf(cid);
    const selfMurder = this.effMurder(self);
    pair[1].send(JSON.stringify({ t: "welcome", id: cid, protocol: 2, murder: selfMurder.count, murderDecayAt: selfMurder.decay }));
    for (const r of this.rows()) {
      if (r.id === cid) continue;
      pair[1].send(JSON.stringify({ t: "profile", id: r.id, name: r.name, faction: r.faction, level: r.level, pkMode: !!r.pk, massacre: !!r.mass }));
    }
    this.broadcast({ t: "join", id: cid }, cid);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage(ws, message) {
    let m;
    try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m.t !== "string") return;
    const cid = this.state.getTags(ws)[0];
    if (!cid) return;
    switch (m.t) {
      case "profile": {
        const name = String(m.name || "Hiep khach").slice(0, 24);
        const faction = String(m.faction || "").slice(0, 16);
        const level = Math.max(1, Math.min(99999, Math.floor(Number(m.level) || 1)));
        this.sql.exec("UPDATE players SET name = ?, faction = ?, level = ? WHERE id = ?", name, faction, level, cid);
        this.broadcast({ t: "profile", id: cid, name, faction, level }, cid);
        break;
      }
      case "move": {
        const x = Math.max(0, Math.min(99999, Number(m.x) || 0));
        const y = Math.max(0, Math.min(99999, Number(m.y) || 0));
        this.broadcast({ t: "move", id: cid, x, y }, cid);
        break;
      }
      case "pk_mode": {
        const pk = m.mode === "pk" || m.mode === "massacre";
        const mass = m.mode === "massacre";
        const row = this.rowOf(cid);
        const selfMurder = this.effMurder(row);
        this.sql.exec("UPDATE players SET pk = ?, mass = ? WHERE id = ?", pk ? 1 : 0, mass ? 1 : 0, cid);
        ws.send(JSON.stringify({ t: "pk_mode", mode: pk ? (mass ? "massacre" : "pk") : "off", murder: selfMurder.count, murderDecayAt: selfMurder.decay }));
        this.broadcast({ t: "profile", id: cid, pkMode: pk, massacre: mass }, cid);
        break;
      }
      case "pk_attack": {
        const me = this.rowOf(cid);
        if (!me || !me.pk) break;                      // phai bat PK moi danh duoc
        const target = this.rowOf(String(m.target || ""));
        if (!target) break;
        if (!me.mass && !target.pk) break;             // PK thuong: muc tieu phai bat PK
        const tws = this.socketOf(target.id);
        if (!tws) break;
        const atk = m.atk && typeof m.atk === "object" ? m.atk : {};
        tws.send(JSON.stringify({
          t: "pk_attack", from: cid, name: String(me.name || "Hiep khach").slice(0, 24),
          atk: { ar: Number(atk.ar) || 0, dmg: Math.max(0, Math.min(9e9, Number(atk.dmg) || 0)), series: Number(atk.series) || 0 },
        }));
        break;
      }
      case "pk_death": {
        // nan vai cid chet vi attackerId -> cong man ap cho tan cong
        const killerId = String(m.attackerId || "");
        const killer = this.rowOf(killerId);
        if (!killer || killerId === cid) break;
        const prev = this.effMurder(killer);
        const newDecay = Math.max(prev.decay, Date.now()) + MURDER_MS;
        const newCount = Math.min(99, prev.count + 1);
        this.sql.exec("UPDATE players SET murder = ?, murder_decay = ? WHERE id = ?", newCount, newDecay, killerId);
        const victim = this.rowOf(cid);
        this.broadcast({ t: "pk_death", victim: cid, victimName: victim ? victim.name : "", killer: killerId, killerName: killer.name });
        const kws = this.socketOf(killerId);
        if (kws) kws.send(JSON.stringify({ t: "murder", count: newCount, decayAt: newDecay }));
        break;
      }
      // phase 2 sau: monsters/ground_drop/drop_pickup — relay mui cho ca room
      case "monsters": case "ground_drop": case "drop_pickup":
        this.broadcast(m, cid);
        break;
    }
  }

  webSocketClose(ws) {
    const cid = this.state.getTags(ws)[0];
    if (!cid) return;
    this.sql.exec("DELETE FROM players WHERE id = ?", cid);
    this.broadcast({ t: "leave", id: cid });
  }
}
