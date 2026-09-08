import argon2 from "argon2";


const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB, OWASP minimum recommendation
  timeCost: 2,
  parallelism: 1,
} satisfies argon2.HashOptions;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash, etc. — never throw on user-controlled input.
    return false;
  }
}
