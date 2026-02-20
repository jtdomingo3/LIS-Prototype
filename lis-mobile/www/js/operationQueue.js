(function (window) {
  const Q_KEY = 'lis-op-queue';
  const OperationQueue = {
    async init() {
      const existing = (await localforage.getItem(Q_KEY));
      if (!existing) await localforage.setItem(Q_KEY, []);
    },
    async enqueue(op) {
      const q = (await localforage.getItem(Q_KEY)) || [];
      q.push(op);
      await localforage.setItem(Q_KEY, q);
      return q.length;
    },
    async peek() {
      const q = (await localforage.getItem(Q_KEY)) || [];
      return q[0];
    },
    async dequeue() {
      const q = (await localforage.getItem(Q_KEY)) || [];
      const item = q.shift();
      await localforage.setItem(Q_KEY, q);
      return item;
    },
    async length() {
      const q = (await localforage.getItem(Q_KEY)) || [];
      return q.length;
    },
    async all() { return (await localforage.getItem(Q_KEY)) || []; },
    async flush(serverUrl, onProgress) {
      const q = (await localforage.getItem(Q_KEY)) || [];
      for (let i = 0; i < q.length; ) {
        const op = q[i];
        try {
          const res = await fetch(serverUrl + (op.path || '/api/operations'), {
            method: op.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(op.body || {})
          });
          if (!res.ok) throw new Error('server:' + res.status);
          q.splice(i, 1);
          await localforage.setItem(Q_KEY, q);
          if (onProgress) onProgress(q.length);
        } catch (err) {
          return { success: false, remaining: q.length, error: String(err) };
        }
      }
      return { success: true, remaining: 0 };
    }
  };
  window.LISOperationQueue = OperationQueue;
})(window);
