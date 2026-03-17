"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { stripHtml } from "@/lib/html-strip";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface ProviderConfig {
  provider: string;
  label: string;
  available: boolean;
}

interface AIPanelProps {
  articleContent: string;
  articleTitle: string;
  onClose: () => void;
}

type Tab = "summary" | "translate" | "chat";

function stopPropagation(e: React.KeyboardEvent) {
  e.stopPropagation();
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <span className="inline-block w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
      {text}
    </div>
  );
}

function StreamingCursor() {
  return <span className="inline-block w-2 h-4 bg-orange-400 animate-pulse ml-0.5" />;
}

export default function AIPanel({
  articleContent,
  articleTitle,
  onClose,
}: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [allModels, setAllModels] = useState<AIModelInfo[]>([]);
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [modelsLoading, setModelsLoading] = useState(false);

  // Summary
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Translate
  const [targetLanguage, setTargetLanguage] = useState("日本語");
  const [translatedText, setTranslatedText] = useState("");
  const [translateLoading, setTranslateLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Derived: models for current provider
  const providerModels = allModels.filter((m) => m.provider === provider);

  // Reset state when article changes
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSummaryText("");
    setSummaryLoading(false);
    setTranslatedText("");
    setTranslateLoading(false);
    setChatMessages([]);
    setChatLoading(false);
  }, [articleContent, articleTitle]);

  // Abort on unmount / close
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load preferences
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences");
        if (!res.ok) return;
        const prefs = await res.json();
        if (prefs["ollama-url"]) setOllamaUrl(prefs["ollama-url"]);
        if (prefs["ai-provider"]) setProvider(prefs["ai-provider"]);
        if (prefs["ai-model"]) setModel(prefs["ai-model"]);
        // Legacy fallback
        if (!prefs["ai-provider"] && prefs["ollama-model"]) {
          setProvider("ollama");
          setModel(prefs["ollama-model"]);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Fetch models
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await fetch("/api/ai/models");
      if (!res.ok) return;
      const data = await res.json();
      const providers: ProviderConfig[] = data.providers || [];
      const models: AIModelInfo[] = data.models || [];
      setAvailableProviders(providers);
      setAllModels(models);

      // Auto-select provider if not set
      if (providers.length > 0) {
        setProvider((prev) => {
          if (prev && providers.some((p) => p.provider === prev)) return prev;
          return providers[0].provider;
        });
      }

      // Auto-select model if not set
      if (models.length > 0) {
        setModel((prev) => {
          if (prev && models.some((m) => m.id === prev)) return prev;
          return models[0].id;
        });
      }
    } catch {
      // ignore
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // When provider changes, auto-select first model for that provider
  useEffect(() => {
    if (!provider) return;
    const models = allModels.filter((m) => m.provider === provider);
    if (models.length > 0 && !models.some((m) => m.id === model)) {
      setModel(models[0].id);
    }
  }, [provider, allModels, model]);

  // Save preference helper
  const savePref = async (key: string, value: string) => {
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
    } catch {
      // ignore
    }
  };

  // Streaming fetch helper
  const streamResponse = async (
    messages: { role: string; content: string }[],
    onChunk: (text: string) => void,
    onDone: () => void
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model, messages }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        onChunk(`[Error: ${err.error || "Request failed"}]`);
        onDone();
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              onDone();
              return;
            }
            // Check for error JSON
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                onChunk(`[Error: ${parsed.error}]`);
                onDone();
                return;
              }
            } catch {
              // Not JSON, treat as text chunk
            }
            onChunk(data);
          }
        }
      }
      onDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // cancelled
      } else {
        onChunk("[Error: Connection failed]");
      }
      onDone();
    }
  };

  // Summary
  const handleSummarize = () => {
    setSummaryText("");
    setSummaryLoading(true);
    const plainText = stripHtml(articleContent).slice(0, 6000);
    streamResponse(
      [
        {
          role: "system",
          content:
            "以下の記事を簡潔に要約してください。記事と同じ言語で回答してください。",
        },
        { role: "user", content: plainText },
      ],
      (chunk) => setSummaryText((prev) => prev + chunk),
      () => setSummaryLoading(false)
    );
  };

  // Translate
  const handleTranslate = () => {
    setTranslatedText("");
    setTranslateLoading(true);
    const plainText = stripHtml(articleContent).slice(0, 6000);
    streamResponse(
      [
        {
          role: "system",
          content: `以下の記事を${targetLanguage}に翻訳してください。意味とトーンを保ってください。`,
        },
        { role: "user", content: plainText },
      ],
      (chunk) => setTranslatedText((prev) => prev + chunk),
      () => setTranslateLoading(false)
    );
  };

  // Chat
  const handleChatSend = () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);

    const plainText = stripHtml(articleContent).slice(0, 6000);
    const apiMessages = [
      {
        role: "system",
        content: `あなたは親切なアシスタントです。ユーザーは以下の記事を読んでいます:\n\n${plainText}\n\n記事について質問に答えてください。`,
      },
      ...updatedMessages,
    ];

    let assistantText = "";
    setChatMessages([...updatedMessages, { role: "assistant", content: "" }]);

    streamResponse(
      apiMessages,
      (chunk) => {
        assistantText += chunk;
        setChatMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: "assistant", content: assistantText };
          return newMessages;
        });
      },
      () => {
        setChatLoading(false);
      }
    );
  };

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const noArticle = !articleContent;

  const tabs: { key: Tab; label: string }[] = [
    { key: "summary", label: "要約" },
    { key: "translate", label: "翻訳" },
    { key: "chat", label: "チャット" },
  ];

  const providerLabel = availableProviders.find((p) => p.provider === provider)?.label || provider;

  return (
    <div className="h-[40vh] bg-white border-t border-gray-200 flex flex-col text-sm">
      {/* Header */}
      <div className="flex items-center px-3 py-1.5 border-b border-gray-200 flex-shrink-0">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-orange-500 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {provider && (
            <span className="text-xs text-gray-400 mr-1">{providerLabel}</span>
          )}
          <button
            onClick={() => {
              setShowSettings((s) => !s);
              if (!showSettings) fetchModels();
            }}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            title="設定"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
            title="閉じる"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-4 flex-shrink-0 flex-wrap">
          <label className="flex items-center gap-1.5 text-gray-600">
            <span className="whitespace-nowrap">プロバイダ:</span>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                savePref("ai-provider", e.target.value);
              }}
              onKeyDown={stopPropagation}
              className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {availableProviders.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.label}
                </option>
              ))}
              {availableProviders.length === 0 && (
                <option value="">利用可能なプロバイダなし</option>
              )}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-gray-600">
            <span className="whitespace-nowrap">モデル:</span>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                savePref("ai-model", e.target.value);
              }}
              onKeyDown={stopPropagation}
              className="border border-gray-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              {modelsLoading && <option>読み込み中...</option>}
              {!modelsLoading && providerModels.length === 0 && (
                <option value="">モデルなし</option>
              )}
              {providerModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {provider === "ollama" && (
            <label className="flex items-center gap-1.5 text-gray-600">
              <span className="whitespace-nowrap">URL:</span>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                onBlur={() => savePref("ollama-url", ollamaUrl)}
                onKeyDown={stopPropagation}
                className="border border-gray-300 rounded px-2 py-0.5 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </label>
          )}
          <button
            onClick={fetchModels}
            className="text-orange-500 hover:text-orange-600 text-sm"
          >
            再取得
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {noArticle ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            記事を選択してください
          </div>
        ) : activeTab === "summary" ? (
          <div>
            {!summaryText && !summaryLoading && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={handleSummarize}
                  disabled={!model}
                  className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  要約する
                </button>
              </div>
            )}
            {summaryLoading && !summaryText && (
              <LoadingSpinner text="要約を生成中..." />
            )}
            {summaryText && (
              <div className="whitespace-pre-wrap text-gray-800">
                {summaryText}
                {summaryLoading && <StreamingCursor />}
              </div>
            )}
          </div>
        ) : activeTab === "translate" ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                onKeyDown={stopPropagation}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="日本語">日本語</option>
                <option value="English">English</option>
                <option value="中文">中文</option>
                <option value="한국어">한국어</option>
              </select>
              <button
                onClick={handleTranslate}
                disabled={!model || translateLoading}
                className="px-4 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                翻訳する
              </button>
            </div>
            {translateLoading && !translatedText && (
              <LoadingSpinner text="翻訳中..." />
            )}
            {translatedText && (
              <div className="whitespace-pre-wrap text-gray-800">
                {translatedText}
                {translateLoading && <StreamingCursor />}
              </div>
            )}
          </div>
        ) : (
          /* Chat tab */
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 && !chatLoading && (
                <div className="text-gray-400 text-center pt-4">
                  記事について質問してみましょう
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-lg whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.content}
                    {chatLoading &&
                      i === chatMessages.length - 1 &&
                      msg.role === "assistant" && <StreamingCursor />}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  stopPropagation(e);
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder="質問を入力..."
                disabled={chatLoading}
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim() || !model}
                className="px-4 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                送信
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
