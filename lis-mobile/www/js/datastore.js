(function (window) {
  const DataStore = {
    _store: null,
    async init() {
      localforage.config({ name: 'lis-mobile', storeName: 'lis_datastore' });
      this._store = localforage;
    },
    async set(key, value) { return this._store.setItem(key, value); },
    async get(key) { return this._store.getItem(key); },
    async remove(key) { return this._store.removeItem(key); },
    async keys() { return this._store.keys(); },
    async clear() { return this._store.clear(); },
    async getAll() {
      const out = {};
      await this._store.iterate((value, key) => { out[key] = value; });
      return out;
    }
  };
  window.LISDataStore = DataStore;
})(window);
