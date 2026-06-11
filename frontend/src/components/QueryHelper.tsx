"use client";

import { useEffect } from "react";

interface QueryHelperProps {
  onSelect: (query: string) => void;
  onClose: () => void;
}

const FORMAT_PARTS = [
  {
    label: "Be specific",
    description: "Name the exact concept, not a category.",
    good: "What is WebAssembly?",
    bad: "Web technologies",
    impact: "Serper returns precise snippets → Researcher has less noise to sift through.",
  },
  {
    label: "Bound the scope",
    description: "One concept at a time. The narrower, the cheaper.",
    good: "History of the Python programming language",
    bad: "The history of all programming languages",
    impact: "Analyst spends fewer tokens filtering. Writer has a clear spine to follow.",
  },
  {
    label: "Ask for facts, not opinions",
    description: "\"What is\", \"How does\", \"History of\" produce clean factual outputs.",
    good: "How does HTTPS work?",
    bad: "Is HTTPS the best security protocol?",
    impact: "LLMs are cheap on facts, expensive on analysis. Opinion tasks burn tokens debating.",
  },
];

const EXAMPLES = [
  {
    query: "What is WebAssembly?",
    note: "Specific tech concept, clear definition, bounded scope",
  },
  {
    query: "How does HTTPS work?",
    note: "Single protocol, factual explainer, well-documented",
  },
  {
    query: "What is Retrieval-Augmented Generation (RAG)?",
    note: "Emerging AI term, concise enough for 1024-token output",
  },
  {
    query: "History of the Python programming language",
    note: "Chronological facts, structured output, no opinion needed",
  },
  {
    query: "What is the difference between TCP and UDP?",
    note: "Two concrete things to compare, factual, brief",
  },
];

export function QueryHelper({ onSelect, onClose }: QueryHelperProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">How to write a cost-efficient query</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Each agent runs on a 1024-token budget. Good queries = better results for less.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Format guide */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Query format rules</h3>
            <div className="space-y-4">
              {FORMAT_PARTS.map((part) => (
                <div key={part.label} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-800">{part.label}</span>
                    <span className="text-xs text-gray-400">{part.description}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                    <div className="rounded bg-green-50 px-2 py-1 text-green-700">
                      ✓ &nbsp;{part.good}
                    </div>
                    <div className="rounded bg-red-50 px-2 py-1 text-red-600">
                      ✗ &nbsp;{part.bad}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 italic">{part.impact}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How it flows through agents */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">How your query flows through the pipeline</h3>
            <div className="flex gap-2 text-xs overflow-x-auto pb-1">
              {[
                { agent: "Researcher", action: "Searches Serper with your query. Narrow query = fewer irrelevant results." },
                { agent: "Analyst", action: "Filters & ranks findings. Less noise = fewer tokens to reason over." },
                { agent: "Writer", action: "Drafts the article. Clear topic = coherent structure without padding." },
                { agent: "Editor", action: "Polishes prose. Short draft = quick pass, no token blowout." },
              ].map((step, i) => (
                <div key={step.agent} className="flex items-start gap-2 min-w-0">
                  <div className="flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-3 w-36">
                    <p className="font-semibold text-gray-700">{step.agent}</p>
                    <p className="text-gray-400 mt-1 leading-snug">{step.action}</p>
                  </div>
                  {i < 3 && <span className="mt-5 text-gray-300 flex-shrink-0">→</span>}
                </div>
              ))}
            </div>
          </section>

          {/* Example queries */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Ready-to-use examples</h3>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.query}
                  type="button"
                  onClick={() => { onSelect(ex.query); onClose(); }}
                  className="w-full text-left rounded-lg border border-gray-200 px-4 py-3 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
                >
                  <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700">
                    {ex.query}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{ex.note}</p>
                </button>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
