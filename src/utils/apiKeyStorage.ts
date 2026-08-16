/**
 * Secure client-side local storage manager for Bring Your Own Key (BYOK) Gemini API key.
 *
 * Privacy Guarantees:
 * - Keys are stored strictly in the user's local browser localStorage.
 * - Keys are never permanently stored in any database or backend server disk.
 * - Cleaned automatically before transmission in the request headers (x-gemini-api-key).
 */

const STORAGE_KEY = "byok_gemini_api_key";

export function getCustomApiKey(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function saveCustomApiKey(key: string): void {
  try {
    const cleaned = (key || "").trim().replace(/^["']|["']$/g, "");
    if (cleaned) {
      localStorage.setItem(STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (err) {
    console.error("Failed to save custom API key to localStorage:", err);
  }
}

export function removeCustomApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to remove custom API key from localStorage:", err);
  }
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}••••••••••••${end}`;
}
