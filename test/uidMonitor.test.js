const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function harness(saved = "[]") {
  let current = "die";
  let timer;
  let stored = saved;
  const statuses = new Map();
  const messages = [];
  const bot = { sendMessage: async (chatId, message) => messages.push(message) };
  const mocks = {
    "fs/promises": {
      mkdir: async () => {},
      readFile: async () => stored,
      writeFile: async (file, value) => { stored = value; },
    },
    path,
    "./config": { uidRealtimeIntervalSeconds: 60, uidCheckTimes: "off" },
    "./utils": {},
    "./sheets": {
      getUidMonitorConfig: async () => ({ times: "off", uids: [] }),
      setViaStatuses: async (items) => items.map((item) => {
        const previous = statuses.get(item.uid) || "";
        statuses.set(item.uid, item.status);
        return { ...item, previous };
      }),
    },
  };
  const context = {
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    module: { exports: {} },
    __dirname: path.resolve(__dirname, "../src"),
    console: { log() {}, warn() {}, error() {} },
    AbortSignal,
    setTimeout: (callback) => { timer = callback; return 1; },
    clearTimeout: () => { timer = null; },
    fetch: async () => {
      if (current === "error") throw new Error("Network unavailable");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: current === "live" ? { height: 100 } : {} }),
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/uidMonitor.js"), "utf8"), context);
  return {
    api: context.module.exports, bot, messages, statuses,
    setStatus: (value) => { current = value; },
    tick: async () => { assert.ok(timer); await timer(); },
    saved: () => stored,
  };
}

for (const mode of ["scheduled", "realtime"]) {
  test(`${mode}: only LIVE -> DIE alerts, including recovery and errors`, async () => {
    const h = harness();
    const uid = "61560975601783";
    if (mode === "realtime") {
      await h.api.startUidMonitor(h.bot);
      await h.api.startRealtimeUidWatch(uid, "123");
      assert.equal(JSON.parse(h.saved())[0].status, "die");
      assert.equal(h.messages.length, 0);
    }
    for (const [status, expectedCount] of [
      ["die", 0], ["die", 0], ["live", 0], ["live", 0],
      ["error", 0], ["die", 1], ["die", 1], ["live", 1], ["die", 2],
    ]) {
      h.setStatus(status);
      if (mode === "scheduled") {
        await h.api.checkUidListNow([uid], { bot: h.bot, chatId: "123", mode });
      } else {
        await h.tick();
      }
      assert.equal(h.messages.length, expectedCount, `${mode}: ${status}`);
      if (status !== "error") {
        const persisted = mode === "scheduled" ? h.statuses.get(uid) : JSON.parse(h.saved())[0].status;
        assert.equal(persisted, status);
      }
    }
    if (mode === "realtime") {
      const restarted = harness(h.saved());
      await restarted.api.startUidMonitor(restarted.bot);
      await restarted.tick();
      assert.equal(restarted.messages.length, 0, "Restart must not repeat DIE alert");
    }
  });
}
