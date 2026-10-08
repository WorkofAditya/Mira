# Mira

Mira is a transport-management web app.

## Dynamic / MongoDB version

The `Dynamic` branch runs the existing frontend through a Node.js server and stores application data in MongoDB instead of browser IndexedDB.

### Requirements

- Node.js 18+
- A MongoDB Atlas cluster
- A MongoDB connection string with permission to read/write the application's database

The project uses Express 5.2.1 and the official MongoDB Node.js driver 7.7.0.

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`.

3. Set:

```env
MONGODB_URI=your_mongodb_atlas_connection_string
MONGODB_DB_NAME=Mira
PORT=3000
```

**Do not commit `.env` or the MongoDB connection string.** The repository ignores `.env`.

4. Start the application:

```bash
npm start
```

5. Open:

```
http://localhost:3000
```

### Data flow

The existing frontend modules keep their existing IndexedDB-style calls and data structures. `db-api.js` provides the compatibility layer, while `server.js` maps those operations to MongoDB.

This means booking, dispatch, employee/driver, salary-slip, preview, backup/restore, and delete flows continue to use the same application-level data flow while persistence happens on the server.

If an existing browser already contains Mira IndexedDB data, the compatibility layer attempts a one-time migration to MongoDB before the application initializes.

### Important

The Node server must be running for the Dynamic branch to read or write application data. The MongoDB URI is intentionally kept outside Git.

For a public deployment, add server-side authentication/authorization before exposing the API to the internet.
