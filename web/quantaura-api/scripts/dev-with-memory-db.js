/**
 * Dev runner for machines without a local MongoDB: boots an in-memory
 * MongoDB (mongodb-memory-server, devDependency), points the API at it and
 * starts server.js. Data is wiped on every restart — for local development
 * and demos only; production uses the real MONGODB_URI from .env.
 *
 * Usage: node scripts/dev-with-memory-db.js
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
    const mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri('quantaura_dev');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
    // The Next dev proxy (.env.local BACKEND_URL) points at 5001
    process.env.PORT = process.env.PORT || '5001';
    console.log(`🧪 In-memory MongoDB at ${process.env.MONGODB_URI} (data resets on restart)`);
    require('../server');
})();
