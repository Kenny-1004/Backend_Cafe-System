import { hash, verify } from '@node-rs/argon2'

// argon2id with the library defaults (memory-hard; OWASP-recommended)
export const hashPassword = (password: string) => hash(password)

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false // placeholder or malformed hash: treat as a wrong password
  }
}

// Compared against when the username does not exist, so a missing user takes as long
// as a wrong password and response times do not reveal valid usernames.
let dummyHash: Promise<string> | undefined
export const dummyPasswordHash = () => (dummyHash ??= hash('not-a-real-password'))

export const MIN_PASSWORD_LENGTH = 8
