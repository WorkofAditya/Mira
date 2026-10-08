/* Mongo-backed IndexedDB compatibility layer.
 * The application keeps its existing data flow and store/keyPath model,
 * while all persistent records are read/written through the Node API.
 */
(function () {
  "use strict";

  const API_BASE = "/api/db";
  const storeRegistry = new Map();
  const dbRegistry = new Map();

  const DEFAULT_STORES = {
    TransportDB: ["bookings", "counters"],
    DispatchDB: ["dispatchBranchState"],
    EmployeeDB: ["employees"],
    DriverDB: ["drivers"],
    SalarySlipDB: ["salarySlips"]
  };

  const defaultKeyPaths = {
    bookings: "branch",
    counters: "name",
    dispatchBranchState: "branch",
    employees: "branch",
    drivers: "branch",
    salarySlips: "id"
  };

  function rememberStore(dbName, storeName, keyPath) {
    if (!storeRegistry.has(dbName)) storeRegistry.set(dbName, new Map());
    storeRegistry.get(dbName).set(storeName, keyPath || defaultKeyPaths[storeName] || "id");
  }

  function getStoreKeyPath(dbName, storeName) {
    return storeRegistry.get(dbName)?.get(storeName) || defaultKeyPaths[storeName] || "id";
  }

  function seedStores(dbName) {
    if (storeRegistry.has(dbName)) return;
    const stores = DEFAULT_STORES[dbName] || [];
    stores.forEach(storeName => rememberStore(dbName, storeName, defaultKeyPaths[storeName]));
  }

  function encode(value) {
    return encodeURIComponent(String(value));
  }

  async function requestJson(url, options) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers || {})
      }
    });

    if (!response.ok) {
      let message = `API request failed (${response.status})`;
      try {
        const body = await response.json();
        message = body.error || message;
      } catch {}
      throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  function makeRequest() {
    return {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null
    };
  }

  function finishRequest(request, result, error) {
    request.result = result;
    request.error = error || null;
    if (error) {
      if (typeof request.onerror === "function") request.onerror({ target: request });
    } else if (typeof request.onsuccess === "function") {
      request.onsuccess({ target: request });
    }
  }

  class FakeTransaction {
    constructor(db, storeNames, mode) {
      this.db = db;
      this.mode = mode;
      this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
      this.error = null;
      this.oncomplete = null;
      this.onerror = null;
      this.onabort = null;
      this.pending = 0;
      this.finished = false;
    }

    start() {
      this.pending += 1;
      return () => {
        this.pending -= 1;
        this.scheduleComplete();
      };
    }

    scheduleComplete() {
      if (this.pending !== 0 || this.finished) return;
      setTimeout(() => {
        if (this.pending !== 0 || this.finished) return;
        this.finished = true;
        if (typeof this.oncomplete === "function") this.oncomplete({ target: this });
      }, 0);
    }

    fail(error) {
      this.error = error;
      if (typeof this.onerror === "function") this.onerror({ target: this });
    }

    objectStore(name) {
      if (!this.storeNames.includes(name)) {
        throw new Error(`Object store "${name}" is not part of this transaction`);
      }
      return new FakeObjectStore(this, name);
    }
  }

  class FakeObjectStore {
    constructor(transaction, name) {
      this.transaction = transaction;
      this.name = name;
      this.keyPath = getStoreKeyPath(transaction.db.name, name);
    }

    get(key) {
      return this.run("GET", key);
    }

    getAll() {
      return this.run("GET_ALL");
    }

    getAllKeys() {
      return this.run("GET_ALL_KEYS");
    }

    put(value) {
      const key = value?.[this.keyPath];
      if (key === undefined || key === null) {
        return this.run("PUT", undefined, value, new Error(`Missing keyPath "${this.keyPath}"`));
      }
      return this.run("PUT", key, value);
    }

    add(value) {
      return this.put(value);
    }

    delete(key) {
      return this.run("DELETE", key);
    }

    clear() {
      return this.run("CLEAR");
    }

    run(operation, key, value, immediateError) {
      const request = makeRequest();
      const done = this.transaction.start();

      if (immediateError) {
        finishRequest(request, undefined, immediateError);
        done();
        return request;
      }

      let url = `${API_BASE}/${encode(this.transaction.db.name)}/${encode(this.name)}`;
      if (operation === "GET") url += `?key=${encode(key)}`;
      if (operation === "GET_ALL") url += "/all";
      if (operation === "GET_ALL_KEYS") url += "/keys";
      if (operation === "DELETE") url += `/${encode(key)}`;

      let options = { method: "GET" };
      if (operation === "PUT") {
        options = { method: "PUT", body: JSON.stringify({ key, value }) };
      } else if (operation === "CLEAR") {
        options = { method: "DELETE" };
      } else if (operation === "DELETE") {
        options = { method: "DELETE" };
      }

      requestJson(url, options)
        .then(payload => finishRequest(request, payload?.value ?? payload, null))
        .catch(error => finishRequest(request, undefined, error))
        .finally(done);

      return request;
    }
  }

  class FakeDatabase {
    constructor(name, version) {
      this.name = name;
      this.version = version || 1;
      seedStores(name);
      this.objectStoreNames = {
        contains: storeName => !!storeRegistry.get(name)?.has(storeName),
        get length() { return storeRegistry.get(name)?.size || 0; },
        item: index => Array.from(storeRegistry.get(name)?.keys() || [])[index] || null
      };
    }

    createObjectStore(name, options = {}) {
      rememberStore(this.name, name, options.keyPath || defaultKeyPaths[name]);
      return new FakeCreatedStore(this, name);
    }

    transaction(storeNames, mode = "readonly") {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      return new FakeTransaction(this, names, mode);
    }

    close() {}
  }

  class FakeCreatedStore {
    constructor(db, name) {
      this.db = db;
      this.name = name;
      this.keyPath = getStoreKeyPath(db.name, name);
    }

    put(value) {
      return this.db.transaction(this.name, "readwrite").objectStore(this.name).put(value);
    }
  }

  window.indexedDB = {
    open(name, version) {
      const request = makeRequest();
      const firstOpen = !dbRegistry.has(name);
      const db = new FakeDatabase(name, version || 1);
      dbRegistry.set(name, db);

      setTimeout(() => {
        if (firstOpen && typeof request.onupgradeneeded === "function") {
          request.onupgradeneeded({ target: { result: db } });
        }
        finishRequest(request, db, null);
      }, 0);

      return request;
    }
  };

  window.mongoDataApi = {
    async health() {
      return requestJson("/api/health");
    }
  };
})();