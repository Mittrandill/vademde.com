/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { QueryClient, QueryObserver } = require('@tanstack/query-core');

const root = path.resolve(__dirname, '..');
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function clock() {
  let now = 0, serial = 0;
  const tasks = new Map();
  return {
    setTimeout(fn, delay) { const id = ++serial; tasks.set(id, { at: now + delay, fn }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    async tick(ms) {
      const end = now + ms;
      await settle();
      while (true) {
        const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, task] = next;
        now = task.at;
        tasks.delete(id);
        task.fn();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

function load(relative, timer, mocks = {}) {
  const filename = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => name in mocks ? mocks[name] : require(name),
    setTimeout: timer.setTimeout, clearTimeout: timer.clearTimeout,
  }, { filename });
  return module.exports;
}

function harness({ interactionDelay = 0 } = {}) {
  const timer = clock();
  const client = new QueryClient({ defaultOptions: {
    queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
    mutations: { gcTime: Infinity, retry: false },
  } });
  const create = load('services/workspaceRefresh.ts', timer).createWorkspaceRefreshQueue;
  const afterInteractions = (callback) => {
    const id = timer.setTimeout(callback, interactionDelay);
    return { cancel: () => timer.clearTimeout(id) };
  };
  const observers = [], queues = [];
  const makeQueue = (workspace = 'w') => {
    const queue = create(client, workspace, afterInteractions);
    queues.push(queue);
    return queue;
  };
  const watch = (key, fetch = async () => 'fresh') => {
    client.setQueryData(key, 'old');
    const calls = [];
    const observer = new QueryObserver(client, {
      queryKey: key, queryFn: (context) => { calls.push(context); return fetch(context); },
    });
    observers.push(observer.subscribe(() => {}));
    return calls;
  };
  const save = () => {
    const result = deferred();
    const mutation = client.getMutationCache().build(client, { mutationFn: () => result.promise });
    const done = mutation.execute({}).then(() => undefined, () => undefined);
    return { ...result, mutation, done };
  };
  return {
    timer, client, watch, save, makeQueue, afterInteractions,
    queue: makeQueue(),
    close() { queues.forEach((q) => q.dispose()); observers.forEach((off) => off()); client.clear(); },
  };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

(async () => {
  await check('36 installments, past payments and reminders refresh once after save completes', async () => {
    const h = harness();
    try {
      const keys = ['obligations', 'transactions', 'reports', 'account-balances', 'counterparties', 'banks', 'financial_documents', 'reminders'];
      const calls = keys.map((key) => h.watch(['w', key]));
      const other = h.watch(['other', 'obligations']);
      const global = h.watch(['subscription']);
      h.client.setQueryData(['w', 'reports', 'inactive'], 'old');
      const save = h.save();
      for (let i = 0; i < 36; i++) { h.queue.enqueue(); await h.timer.tick(25); }
      for (let i = 0; i < 13 * 3 + 4; i++) h.queue.enqueue();
      await h.timer.tick(5000);
      assert.ok(calls.every((c) => c.length === 0), 'no realtime fetch competes with a pending save');
      save.resolve(); await save.done;
      await h.timer.tick(400);
      assert.ok(calls.every((c) => c.length === 1), 'each active query refreshes exactly once');
      assert.equal(other.length, 0); assert.equal(global.length, 0);
      assert.equal(h.client.getQueryState(['w', 'reports', 'inactive']).isInvalidated, true);
      assert.equal(h.client.getQueryData(['w', 'reports']), 'fresh');
    } finally { h.close(); }
  });

  await check('external row bursts are coalesced and continuous team activity is not starved', async () => {
    const h = harness();
    try {
      let version = 0;
      const calls = h.watch(['w', 'obligations'], async () => version);
      for (let i = 0; i < 36; i++) { version++; h.queue.enqueue(); await h.timer.tick(20); }
      assert.equal(calls.length, 1, 'a fixed batching window flushes even while events continue');
      await h.timer.tick(400);
      assert.equal(calls.length, 2);
      assert.equal(h.client.getQueryData(['w', 'obligations']), 36);
    } finally { h.close(); }
  });

  await check('events during a slow refresh do not restart it and cause one trailing refresh', async () => {
    const h = harness();
    try {
      const first = deferred(); let version = 1, count = 0, aborted = 0;
      const calls = h.watch(['w', 'obligations'], ({ signal }) => {
        signal.addEventListener('abort', () => aborted++);
        return ++count === 1 ? first.promise : Promise.resolve(version);
      });
      h.queue.enqueue(); await h.timer.tick(400);
      for (let i = 0; i < 36; i++) { version++; h.queue.enqueue(); await h.timer.tick(50); }
      assert.equal(calls.length, 1); assert.equal(aborted, 0);
      first.resolve(1); await settle(); await h.timer.tick(400);
      assert.equal(calls.length, 2); assert.equal(aborted, 0);
      assert.equal(h.client.getQueryData(['w', 'obligations']), 37);
    } finally { h.close(); }
  });

  await check('a save starting during the batching window defers the refresh', async () => {
    const h = harness();
    try {
      const calls = h.watch(['w', 'obligations']);
      h.queue.enqueue(); await h.timer.tick(200);
      const save = h.save(); await h.timer.tick(2000);
      assert.equal(calls.length, 0);
      save.resolve(); await save.done; await h.timer.tick(400);
      assert.equal(calls.length, 1);
    } finally { h.close(); }
  });

  await check('a save starting while navigation is active is rechecked before refreshing', async () => {
    const h = harness({ interactionDelay: 200 });
    try {
      const calls = h.watch(['w', 'obligations']);
      h.queue.enqueue(); await h.timer.tick(400);
      const save = h.save(); await h.timer.tick(3000);
      assert.equal(calls.length, 0);
      save.resolve(); await save.done; await h.timer.tick(600);
      assert.equal(calls.length, 1);
    } finally { h.close(); }
  });

  await check('multiple writes defer refresh until the last write finishes, including failure', async () => {
    const h = harness();
    try {
      const calls = h.watch(['w', 'obligations']);
      const first = h.save(), second = h.save();
      h.queue.enqueue(); first.resolve(); await first.done; await h.timer.tick(2000);
      assert.equal(calls.length, 0);
      second.reject(new Error('save failed after a partial write'));
      await second.done; await h.timer.tick(400);
      assert.equal(calls.length, 1);
    } finally { h.close(); }
  });

  await check('a restored offline mutation does not indefinitely block team updates', async () => {
    const h = harness();
    try {
      const calls = h.watch(['w', 'obligations']);
      h.client.getMutationCache().build(h.client, {}, {
        context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null,
        isPaused: true, status: 'pending', variables: undefined, submittedAt: 1,
      });
      h.queue.enqueue(); await h.timer.tick(400);
      assert.equal(calls.length, 1);
    } finally { h.close(); }
  });

  await check('workspace change cancels pending timers and ignores late old-channel events', async () => {
    const h = harness();
    try {
      const old = h.watch(['w', 'obligations']), next = h.watch(['next', 'obligations']);
      h.queue.enqueue(); await h.timer.tick(200); h.queue.dispose();
      h.queue.enqueue(); h.makeQueue('next').enqueue(); await h.timer.tick(1000);
      assert.equal(old.length, 0); assert.equal(next.length, 1);
    } finally { h.close(); }
  });

  await check('logout cancels interaction callbacks and mutation completion cannot revive the queue', async () => {
    const h = harness({ interactionDelay: 200 });
    try {
      const calls = h.watch(['w', 'obligations']);
      h.queue.enqueue(); await h.timer.tick(400); h.queue.dispose();
      const save = h.save(); save.resolve(); await save.done; await h.timer.tick(2000);
      assert.equal(calls.length, 0);
    } finally { h.close(); }
  });

  await check('disposing during a refresh suppresses a queued trailing refresh', async () => {
    const h = harness();
    try {
      const request = deferred();
      const calls = h.watch(['w', 'obligations'], () => request.promise);
      h.queue.enqueue(); await h.timer.tick(400); h.queue.enqueue(); h.queue.dispose();
      request.resolve('fresh'); await settle(); await h.timer.tick(2000);
      assert.equal(calls.length, 1);
    } finally { h.close(); }
  });

  await check('a failed refresh does not loop; the next external event can refresh successfully', async () => {
    const h = harness();
    try {
      let fail = true;
      const calls = h.watch(['w', 'obligations'], async () => {
        if (fail) throw new Error('network unavailable');
        return 'recovered';
      });
      h.queue.enqueue(); await h.timer.tick(4000); assert.equal(calls.length, 1);
      fail = false; h.queue.enqueue(); await h.timer.tick(400);
      assert.equal(calls.length, 2);
      assert.equal(h.client.getQueryData(['w', 'obligations']), 'recovered');
    } finally { h.close(); }
  });

  await check('an earlier in-flight query cannot overwrite the post-event snapshot', async () => {
    const h = harness();
    try {
      const oldRequest = deferred(); let requests = 0;
      const key = ['w', 'obligations'];
      h.watch(key, () => ++requests === 1 ? oldRequest.promise : Promise.resolve('new snapshot'));
      const initial = h.client.refetchQueries({ queryKey: key });
      await settle(); h.queue.enqueue(); await h.timer.tick(400);
      oldRequest.resolve('old snapshot'); await initial; await settle();
      assert.equal(h.client.getQueryData(key), 'new snapshot');
      assert.equal(requests, 2);
    } finally { h.close(); }
  });

  await check('native realtime hook routes every table through batching and cleans up the channel', async () => {
    const h = harness();
    try {
      let cleanup, removed = false;
      const callbacks = new Map();
      const channel = {
        on(_type, filter, callback) { assert.equal(filter.filter, 'workspace_id=eq.w'); callbacks.set(filter.table, callback); return this; },
        subscribe() {},
      };
      const module = load('services/realtime.ts', h.timer, {
        react: { useEffect: (fn) => { cleanup = fn(); } },
        'react-native': { InteractionManager: { runAfterInteractions: h.afterInteractions } },
        '@tanstack/react-query': { useQueryClient: () => h.client },
        '@/services/supabase': { supabase: { channel: () => channel, removeChannel: () => { removed = true; } } },
        '@/services/workspaceRefresh': load('services/workspaceRefresh.ts', h.timer),
      });
      const calls = h.watch(['w', 'obligations']);
      module.useWorkspaceRealtime('w');
      assert.equal(callbacks.size, 10);
      for (let i = 0; i < 36; i++) callbacks.get('installments')();
      await h.timer.tick(400); assert.equal(calls.length, 1);
      callbacks.get('payments')(); cleanup();
      for (const callback of callbacks.values()) callback();
      await h.timer.tick(2000); assert.equal(calls.length, 1); assert.equal(removed, true);
    } finally { h.close(); }
  });

  console.log(`\n${passed} realtime regression checks passed (real TanStack QueryClient, no network).`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
