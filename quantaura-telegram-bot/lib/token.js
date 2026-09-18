const jwt = require('jsonwebtoken');

/**
 * Self-signed service JWT, verified by quantaura-api.
 *
 * Must stay compatible with quantaura-api/middleware/auth.js: same JWT_SECRET
 * (both processes read the same .env value), same `{ sub: userId }` payload
 * shape. The bot signs its own token instead of storing a service-account
 * password because it already holds the secret the API trusts — a password in
 * the environment would be a second secret protecting nothing.
 */
const JWT_SECRET = process.env.JWT_SECRET || 'quantaura-dev-secret-change-in-production';
if (!process.env.JWT_SECRET) {
    console.warn('⚠ JWT_SECRET not set — using the insecure dev default. The API will reject these tokens unless it is using the same default.');
}

const TOKEN_TTL = '30d';

function signToken(user) {
    return jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

module.exports = { signToken };
