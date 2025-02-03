import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import sodium from "libsodium-wrappers";

export async function decryptKeys(
  cipherText: string,
  x25519PrivateKey: string,
  logger: Logs
): Promise<{ decryptedText: string; publicKey: string } | { decryptedText: null; publicKey: null }> {
  await sodium.ready;

  let publicKey: null | string = null;

  publicKey = await getScalarKey(x25519PrivateKey);
  if (!publicKey) {
    logger.error("Public key is null");
    return { decryptedText: null, publicKey: null };
  }
  if (!cipherText?.length) {
    logger.error("No cipherText was provided");
    return { decryptedText: null, publicKey: null };
  }
  const binaryPublic = sodium.from_base64(publicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
  const binaryPrivate = sodium.from_base64(x25519PrivateKey, sodium.base64_variants.URLSAFE_NO_PADDING);

  const binaryCipher = sodium.from_base64(cipherText, sodium.base64_variants.URLSAFE_NO_PADDING);

  const decryptedText: string | null = sodium.crypto_box_seal_open(binaryCipher, binaryPublic, binaryPrivate, "text");

  return { decryptedText: decryptedText, publicKey: publicKey };
}

async function getScalarKey(x25519PrivateKey: string) {
  await sodium.ready;
  const binPriv = sodium.from_base64(x25519PrivateKey, sodium.base64_variants.URLSAFE_NO_PADDING);
  return sodium.crypto_scalarmult_base(binPriv, "base64");
}
