require("dotenv").config();

const path = require("path");
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Set it in your environment before starting the server.");
}

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

let records;

async function start() {
  await client.connect();
  await client.db("admin").command({ ping: 1 });

  const database = client.db(process.env.MONGODB_DB_NAME || "Mira");
  records = database.collection("app_records");

  await records.createIndex(
    { dbName: 1, storeName: 1, key: 1 },
    { unique: true, name: "record_identity" }
  );

  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", async (_req, res) => {
    try {
      await database.command({ ping: 1 });
      res.json({ ok: true, database: database.databaseName });
    } catch (error) {
      res.status(503).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/db/:db/:store", async (req, res, next) => {
    try {
      const { db, store } = req.params;
      const key = req.query.key;
      if (key === undefined) return res.status(400).json({ error: "key is required" });

      const record = await records.findOne({ dbName: db, storeName: store, key: String(key) });
      res.json({ value: record?.value ?? null });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/db/:db/:store/all", async (req, res, next) => {
    try {
      const docs = await records.find({
        dbName: req.params.db,
        storeName: req.params.store
      }).sort({ _id: 1 }).toArray();

      res.json({ value: docs.map(doc => doc.value) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/db/:db/:store/keys", async (req, res, next) => {
    try {
      const docs = await records.find({
        dbName: req.params.db,
        storeName: req.params.store
      }).sort({ _id: 1 }).project({ key: 1, _id: 0 }).toArray();

      res.json({ value: docs.map(doc => doc.key) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/db/:db/:store", async (req, res, next) => {
    try {
      const { db, store } = req.params;
      const { key, value } = req.body || {};

      if (key === undefined || value === undefined) {
        return res.status(400).json({ error: "key and value are required" });
      }

      await records.updateOne(
        { dbName: db, storeName: store, key: String(key) },
        {
          $set: {
            dbName: db,
            storeName: store,
            key: String(key),
            value,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );

      res.json({ ok: true, value });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/db/:db/:store/:key", async (req, res, next) => {
    try {
      await records.deleteOne({
        dbName: req.params.db,
        storeName: req.params.store,
        key: String(req.params.key)
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/db/:db/:store", async (req, res, next) => {
    try {
      await records.deleteMany({
        dbName: req.params.db,
        storeName: req.params.store
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(path.join(__dirname)));

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  });

  app.listen(PORT, () => {
    console.log(`Mira server running at http://localhost:${PORT}`);
  });
}

start().catch(error => {
  console.error("Failed to start Mira server:", error);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`${signal}: closing MongoDB connection`);
  await client.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));