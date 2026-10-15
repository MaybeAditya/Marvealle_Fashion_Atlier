import jwt from 'jsonwebtoken';
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('JWT_SECRET is missing or too short. Configure it in the backend environment.');
  }
  return secret;
}

export function issueToken(user) {
  return jwt.sign(
    { user_id: String(user.id), email: user.email },
    requireJwtSecret(),
    { algorithm: 'HS256', expiresIn: '7d' }
  );
}

export function readTokenFromRequest(req, { optional = false } = {}) {
  const authHeader = req.get('authorization');
  if (!authHeader) {
    if (optional) return null;
    const error = new Error('Access denied');
    error.status = 401;
    throw error;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    const error = new Error('Invalid authorization header');
    error.status = 401;
    throw error;
  }
  try {
    const claims = jwt.verify(match[1], requireJwtSecret(), { algorithms: ['HS256'] });
    if (!claims || typeof claims !== 'object' || !claims.user_id || !claims.email) {
      throw new Error('Missing token claims');
    }
    return claims;
  } catch {
    const error = new Error('Invalid or expired token');
    error.status = 401;
    throw error;
  }
}

export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  try {
    if (hash.startsWith('$argon2')) return await argon2Verify({ password, hash });
    if (hash.startsWith('$2')) return await bcrypt.compare(password, hash);
    // Google-only accounts store a sentinel, which must never authenticate as a password.
    return false;
  } catch {
    return false;
  }
}

export async function hashPassword(password) {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: 'encoded'
  });
}
