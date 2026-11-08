import argon2 from "argon2"

// argon2id per §S.3 (library defaults for memory/time cost are current OWASP-sane).
export const hashPassword = (password: string): Promise<string> =>
  argon2.hash(password, { type: argon2.argon2id })

export const verifyPassword = (hash: string, password: string): Promise<boolean> =>
  argon2.verify(hash, password)
