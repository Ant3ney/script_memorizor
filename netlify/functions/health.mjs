import { connectToMongoDB } from "../../database.js";

export default async function healthHandler() {
  try {
    const client = await connectToMongoDB();
    await client.db(process.env.MONGODB_DB_NAME || "script_memorizor").command({ ping: 1 });
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "The database is unavailable." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      },
    );
  }
}

export const config = {
  path: "/api/health",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
