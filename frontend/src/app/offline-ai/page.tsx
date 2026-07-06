import Link from "next/link";

const rows: [string, string][] = [
  ["Model", "qwen2.5:7b — ~7.6B parameters"],
  ["Full precision (FP16) weights", "7.6B × 2 bytes ≈ 15.2 GB — won't fit"],
  ["Quantized weights (Q4_K_M)", "7.6B × ~0.56 byte ≈ 4.7 GB — what Ollama actually loads"],
  ["KV cache @ 4K token context", "≈ 230 MB (thanks to grouped-query attention)"],
  ["Ollama + Metal runtime overhead", "≈ 1–2 GB"],
  ["Total resident memory", "≈ 6–7 GB"],
  ["Unified memory available", "16 GB (Apple M1 Pro, shared by CPU + GPU)"],
  ["Headroom left for OS, browser, editor", "≈ 9–10 GB"],
];

export default function OfflineAiPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12">
      <div className="mx-auto max-w-3xl space-y-5 p-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Offline AI</h1>
            <p className="mt-1 text-gray-500">
              Running qwen2.5:7b locally with Ollama on a MacBook Pro (Apple M1 Pro,
              16 GB unified memory).
            </p>
          </div>
          <Link
            href="/"
            className="flex-shrink-0 text-sm text-gray-400 hover:text-indigo-600 transition-colors"
          >
            ← All tools
          </Link>
        </div>

        {/* The math */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Item</th>
                <th className="px-4 py-2 text-left font-semibold">Rough value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(([item, value]) => (
                <tr key={item}>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{item}</td>
                  <td className="px-4 py-2 text-gray-600">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Takeaway */}
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 leading-relaxed">
          <p>
            Quantization is the key move — dropping weights from 16-bit to 4-bit cuts
            memory need by roughly 3×, turning a model that wouldn&apos;t fit into one
            that runs with headroom to spare. Apple Silicon helps too: there&apos;s no
            separate VRAM ceiling like on a discrete GPU — CPU and GPU share the same
            memory pool, so the model gets access to the full 16 GB budget instead of a
            fixed slice of it.
          </p>
          <hr className="my-4 border-gray-200" />
          <p>
            A 7B model at 4-bit quantization needs about 6–7 GB of memory. This Mac has
            16 GB of unified memory shared between CPU and GPU, so the model fits
            comfortably, with room to spare for everything else running alongside it.
          </p>
        </div>

      </div>
    </main>
  );
}
