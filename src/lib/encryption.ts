import CryptoJS from 'crypto-js';

const SALT = "PSY_SECURE_CHAT_SALT_v1";

const deriveKey = (conversationId: string): CryptoJS.lib.WordArray => {
    return CryptoJS.SHA256(conversationId + SALT);
};

export const encryptMessage = (text: string, conversationId: string): string => {
    try {
        const key = deriveKey(conversationId);
        const iv = CryptoJS.lib.WordArray.random(16);

        const encrypted = CryptoJS.AES.encrypt(text, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        // Format: IV(Hex):Ciphertext(Base64)
        return iv.toString(CryptoJS.enc.Hex) + ":" + encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    } catch (error) {
        console.error("Encryption failed:", error);
        return text;
    }
};

export const decryptMessage = (encryptedText: string, conversationId: string): string => {
    if (!encryptedText || !encryptedText.includes(":")) {
        return encryptedText;
    }

    try {
        const parts = encryptedText.split(":");
        if (parts.length !== 2) return encryptedText;

        const ivHex = parts[0];
        const ciphertextBase64 = parts[1];

        const key = deriveKey(conversationId);
        const iv = CryptoJS.enc.Hex.parse(ivHex);

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(ciphertextBase64) } as CryptoJS.lib.CipherParams,
            key,
            {
                iv: iv,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7
            }
        );

        const result = decrypted.toString(CryptoJS.enc.Utf8);
        return result || encryptedText;
    } catch (error) {
        // console.error("Decryption failed:", error); 
        // Silent fail for old messages
        return encryptedText;
    }
};
