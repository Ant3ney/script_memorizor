import { MongoClient, ServerApiVersion } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB_NAME || "script_memorizor";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env and add your Atlas URI.");
}

const client = new MongoClient(mongoUri, {
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 8_000,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let connectionPromise;
let collectionPromise;

export async function connectToMongoDB() {
  if (!connectionPromise) {
    connectionPromise = client.connect().catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }

  await connectionPromise;
  return client;
}

export async function getScriptSlotsCollection() {
  if (!collectionPromise) {
    collectionPromise = connectToMongoDB()
      .then(async (connectedClient) => {
        const collection = connectedClient.db(databaseName).collection("script_slots");
        await collection.createIndex({ slotId: 1 }, { unique: true });
        return collection;
      })
      .catch((error) => {
        collectionPromise = undefined;
        throw error;
      });
  }

  return collectionPromise;
}

export async function disconnectFromMongoDB() {
  if (!connectionPromise) return;

  await client.close();
  connectionPromise = undefined;
  collectionPromise = undefined;
}
