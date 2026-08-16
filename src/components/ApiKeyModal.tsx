import React, { useState, useEffect } from "react";
import { Key, X, ExternalLink, ShieldCheck, AlertTriangle, Check, Trash2, Eye, EyeOff, Lock, UserPlus, Info } from "lucide-react";
import { getCustomApiKey, saveCustomApiKey, removeCustomApiKey, maskApiKey } from "../utils/apiKeyStorage";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyChange?: (newKey: string) => void;
}

export default function ApiKeyModal({ isOpen, onClose, onKeyChange }: ApiKeyModalProps) {
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [savedKey, setSavedKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  // Sync state with localStorage on open
  useEffect(() => {
    if (isOpen) {
      const stored = getCustomApiKey();
      setSavedKey(stored);
      setApiKeyInput(stored);
      setIsEditing(!stored);
      setShowKey(false);
      setFeedbackMsg(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSaveKey = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = apiKeyInput.trim().replace(/^["']|["']$/g, "");

    if (!cleanKey) {
      handleRemoveKey();
      return;
    }

    if (!cleanKey.startsWith("AIzaSy") && cleanKey.length < 20) {
      setFeedbackMsg({
        type: "error",
        text: "Please enter a valid Google Gemini API key (typically starts with 'AIzaSy...').",
      });
      return;
    }

    saveCustomApiKey(cleanKey);
    setSavedKey(cleanKey);
    setIsEditing(false);
    setFeedbackMsg({
      type: "success",
      text: "API key saved to your local browser storage. It will be used for document conversions.",
    });
    if (onKeyChange) {
      onKeyChange(cleanKey);
    }
  };

  const handleRemoveKey = () => {
    removeCustomApiKey();
    setSavedKey("");
    setApiKeyInput("");
    setIsEditing(true);
    setFeedbackMsg({
      type: "info",
      text: "Custom API key removed from browser storage. The app will now use default backend credentials or local offline conversion.",
    });
    if (onKeyChange) {
      onKeyChange("");
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="byok-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="byok-modal-title"
    >
      <div
        id="byok-modal-container"
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-150"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 id="byok-modal-title" className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <span>Bring Your Own Key (BYOK)</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/60">
                  Google Gemini
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Supply your personal Google AI Studio Gemini API key
              </p>
            </div>
          </div>

          <button
            id="byok-modal-close-btn"
            type="button"
            onClick={onClose}
            className="p-2 bg-zinc-800/80 hover:bg-rose-950/50 hover:text-rose-400 hover:border-rose-800/60 text-zinc-400 border border-zinc-700/70 rounded-xl transition cursor-pointer"
            title="Close modal (Esc)"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Security & Privacy Notice Card */}
          <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Private & Client-Side Stored</span>
            </div>
            <p className="text-zinc-300 leading-relaxed">
              Your API key is <strong>never saved or logged on our servers or databases</strong>. It is stored exclusively in your local browser’s <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono text-[11px]">localStorage</code> and sent securely to Google's API during document conversion.
            </p>
            <div className="flex items-start gap-2 pt-1 text-amber-300/90 text-[11px] leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <strong>Security Reminder:</strong> Because the key is kept in your browser storage, you can easily <strong>delete or remove the key</strong> once you are finished with your session if you are using a shared computer or concerned about browser hacks.
              </span>
            </div>
          </div>

          {/* Feedback Message Banner */}
          {feedbackMsg && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                feedbackMsg.type === "success"
                  ? "bg-emerald-950/50 border-emerald-800/60 text-emerald-300"
                  : feedbackMsg.type === "error"
                  ? "bg-rose-950/50 border-rose-800/60 text-rose-300"
                  : "bg-zinc-800/80 border-zinc-700 text-zinc-300"
              }`}
            >
              {feedbackMsg.type === "success" && <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
              {feedbackMsg.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
              {feedbackMsg.type === "info" && <Info className="w-4 h-4 shrink-0 text-indigo-400" />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* Key Status & Configuration Form */}
          {savedKey && !isEditing ? (
            /* Key Active Card */
            <div className="p-4 rounded-xl bg-zinc-800/60 border border-zinc-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-medium">Active Custom API Key:</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-semibold">
                  Saved in Browser
                </span>
              </div>

              <div className="flex items-center justify-between bg-zinc-950 px-3 py-2.5 rounded-lg border border-zinc-800 font-mono text-xs">
                <span className="text-zinc-200">
                  {showKey ? savedKey : maskApiKey(savedKey)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="text-zinc-400 hover:text-zinc-200 transition p-1 cursor-pointer"
                  title={showKey ? "Hide key" : "Reveal key"}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  id="byok-change-btn"
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setApiKeyInput(savedKey);
                    setFeedbackMsg(null);
                  }}
                  className="flex-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs font-medium transition cursor-pointer text-center"
                >
                  Change Key
                </button>

                <button
                  id="byok-remove-btn"
                  type="button"
                  onClick={handleRemoveKey}
                  className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Key</span>
                </button>
              </div>
            </div>
          ) : (
            /* Key Input Form */
            <form onSubmit={handleSaveKey} className="space-y-3">
              <div>
                <label htmlFor="gemini-api-key-input" className="block text-xs font-semibold text-zinc-200 mb-1.5">
                  Google Gemini API Key
                </label>
                <div className="relative">
                  <input
                    id="gemini-api-key-input"
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-1 cursor-pointer"
                    title={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="byok-save-btn"
                  type="submit"
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-xs transition shadow-md shadow-amber-950/40 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savedKey ? "Update API Key" : "Save Key to Browser"}</span>
                </button>

                {savedKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setApiKeyInput(savedKey);
                    }}
                    className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Quick Links for Getting a Key & Google Account */}
          <div className="pt-3 border-t border-zinc-800 space-y-2.5">
            <h4 className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
              Need a Key or Google Account?
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Direct Link to Google AI Studio Key Page */}
              <a
                id="byok-get-key-link"
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-amber-500/50 transition group flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 text-zinc-200 group-hover:text-amber-300 font-medium">
                  <Key className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Get a Gemini API Key</span>
                </div>
                <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              </a>

              {/* Link for Creating a Google Account */}
              <a
                id="byok-create-account-link"
                href="https://accounts.google.com/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 hover:border-indigo-500/50 transition group flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 text-zinc-200 group-hover:text-indigo-300 font-medium">
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Create Google Account</span>
                </div>
                <ExternalLink className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
              </a>
            </div>

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Google AI Studio provides free-tier API keys with generous rate limits suitable for multimodal document conversion and OCR.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
          <span className="text-[11px] text-zinc-500">
            Stored in LocalStorage • Zero Server Retention
          </span>

          <button
            id="byok-modal-bottom-done-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium rounded-lg transition cursor-pointer text-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
