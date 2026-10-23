import "dotenv/config";

const secret = process.env.JWT_SECRET || "dev-attest-super-secret-jwt-key-2026";
if (!secret) {
    throw new Error('Jwt secret not set');
}

export const JWT_SECRET: string = secret;

export const JWT_EXPIRY: number = Number(process.env.JWT_EXPIRY) || 3600 * 24 * 7;
