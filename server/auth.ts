import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { AuthUserSession, UserRole } from '../shared/attendanceDomain';
import { readValidatedSessionSecretSafe } from './envConfig';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const revokedTokenIds = new Map<string, number>();

function getSessionSecret(): string {
  const envCheck = readValidatedSessionSecretSafe();
  return envCheck.configured && envCheck.secret ? envCheck.secret : EPHEMERAL_FALLBACK_SECRET;
}

function pruneRevokedTokens(): void {
  const now = Date.now();
  for (const [jti, exp] of revokedTokenIds.entries()) {
    if (exp <= now) revokedTokenIds.delete(jti);
  }
}

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  const expected = Buffer.from(hexHash, 'hex');
  const candidate = crypto.scryptSync(plainPassword, salt, 64);
  if (expected.length !== candidate.length) return false;
  return crypto.timingSafeEqual(expected, candidate);
}

interface TokenPayload {
  uid: string;
  role: UserRole;
  exp: number;
  jti?: string;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function issueAuthToken(userId: string, role: UserRole): string {
  const payload: TokenPayload = {
    uid: userId,
    role,
    exp: Date.now() + TOKEN_TTL_MS,
    jti: crypto.randomUUID(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function revokeAuthToken(token: string): void {
  const payload = verifyAuthToken(token);
  if (payload?.jti) {
    pruneRevokedTokens();
    revokedTokenIds.set(payload.jti, payload.exp);
  }
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');

  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed?.uid || !parsed?.role || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    if (parsed.jti && revokedTokenIds.has(parsed.jti)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUserSession;
}

export function loadUserSessionById(db: DatabaseSync, userId: string): AuthUserSession | null {
  const row = db
    .prepare(
      `SELECT id, username, email, full_name, role, guardian_id, is_active
       FROM app_users
       WHERE id = ?`
    )
    .get(userId) as
    | {
        id: string;
        username: string;
        email: string;
        full_name: string;
        role: UserRole;
        guardian_id: string | null;
        is_active: number;
      }
    | undefined;

  if (!row || row.is_active !== 1) return null;

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    guardianId: row.guardian_id,
  };
}

export function hasAnyAdminUser(db: DatabaseSync): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM app_users WHERE role = 'admin' AND is_active = 1`)
    .get() as { cnt: number };
  return Number(row?.cnt || 0) > 0;
}

export function recordAuditLog(
  db: DatabaseSync,
  actor: { id: string; fullName: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
): void {
  db.prepare(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `aud_${crypto.randomUUID()}`,
    actor.id,
    actor.fullName,
    actor.role,
    action,
    entityType,
    entityId,
    JSON.stringify(details),
    new Date().toISOString()
  );
}

export function createAuthMiddleware(db: DatabaseSync) {
  return {
    requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!token) {
        res.status(401).json({ ok: false, error: 'Se requiere autenticación válida.' });
        return;
      }

      const payload = verifyAuthToken(token);
      if (!payload) {
        res.status(401).json({ ok: false, error: 'Sesión inválida o expirada.' });
        return;
      }

      const user = loadUserSessionById(db, payload.uid);
      if (!user) {
        res.status(401).json({ ok: false, error: 'Usuario inactivo o inexistente.' });
        return;
      }

      req.authUser = user;
      next();
    },

    requireRoles: (allowedRoles: UserRole[]) => {
      return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.authUser) {
          res.status(401).json({ ok: false, error: 'Se requiere autenticación.' });
          return;
        }
        if (!allowedRoles.includes(req.authUser.role)) {
          res.status(403).json({
            ok: false,
            error: 'No cuenta con permisos institucionales suficientes para esta operación.',
          });
          return;
        }
        next();
      };
    },
  };
}
