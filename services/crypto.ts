const enc = new TextEncoder();
const dec = new TextDecoder();

const getPasswordKey = (password: string) => 
  window.crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);

const deriveKey = (passwordKey: CryptoKey, salt: Uint8Array, keyUsage: KeyUsage[]) => 
  window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsage
  );

// --- TEXT ENCRYPTION ---
export const encryptData = async (text: string, password: string, providedSalt?: string) => {
  const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const salt = providedSalt ? fromHex(providedSalt) : window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(text));
  return { ciphertext: toHex(encrypted), iv: toHex(iv), salt: toHex(salt) };
};

export const decryptData = async (ciphertext: string, ivHex: string, saltHex: string, password: string) => {
  const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const salt = fromHex(saltHex);
  const iv = fromHex(ivHex);
  const data = fromHex(ciphertext);
  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
  return dec.decode(decrypted);
};

// --- FILE ENCRYPTION ---
export const encryptFile = async (file: File, password: string): Promise<Blob> => {
  const fileData = await file.arrayBuffer();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, fileData);
  
  // Pack: [Salt (16b)] + [IV (12b)] + [EncryptedData]
  return new Blob([salt, iv, encrypted], { type: 'application/octet-stream' }); 
};

export const decryptFile = async (encryptedBlob: Blob, password: string, mimeType?: string): Promise<Blob> => {
  const buffer = await encryptedBlob.arrayBuffer();
  const salt = new Uint8Array(buffer.slice(0, 16));
  const iv = new Uint8Array(buffer.slice(16, 28));
  const data = buffer.slice(28);
  
  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);
  const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, data);
  
  return new Blob([decrypted], { type: mimeType || 'application/octet-stream' });
};