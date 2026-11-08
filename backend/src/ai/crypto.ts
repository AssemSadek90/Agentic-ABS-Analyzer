import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM for stored provider API keys (§S.3). Stored form is
// "<iv_hex>:<ciphertext_hex>:<authtag_hex>" with a fresh 12-byte IV per write.

const KEY_RE = /^[0-9a-fA-F]{64}$/

export const assertEncryptionKey = (): void => {
  const hex = process.env.APP_ENCRYPTION_KEY ?? ""
  if (!KEY_RE.test(hex)) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
        "and put it in .env before starting the backend."
    )
  }
}

const masterKey = (): Buffer => {
  assertEncryptionKey()
  return Buffer.from(process.env.APP_ENCRYPTION_KEY as string, "hex")
}

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return `${iv.toString("hex")}:${ciphertext.toString("hex")}:${cipher.getAuthTag().toString("hex")}`
}

export const decryptSecret = (stored: string): string => {
  const [ivHex, dataHex, tagHex] = stored.split(":")
  if (!ivHex || !dataHex || !tagHex) {
    throw new Error("Malformed encrypted secret")
  }
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8")
}
