import Link from "next/link";

const tools = [
  {
    href: "/research",
    title: "Multi-Agent Research Pipeline",
    description:
      "Four specialized AI agents — Researcher, Analyst, Writer, and Editor — collaborate sequentially to produce a polished article on any topic you choose.",
  },
  {
    href: "/browser-navigator",
    title: "Multi-Agent Browser Navigator",
    description:
      "An autonomous agent that opens a browser, navigates to a target URL, locates a specific document, and downloads it — no human clicks required.",
  },
  {
    href: "/offline-ai",
    title: "Offline AI",
    description:
      "The memory math behind running a 7B-parameter model entirely locally via Ollama — no API keys, no cloud, no cost.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
        <p className="text-sm font-semibold text-indigo-600 uppercase tracking-widest mb-4">
          Agentic AI Demo
        </p>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Multi-Agent Tools
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          A hands-on showcase of autonomous AI agents built with CrewAI. Each
          tool demonstrates a different agentic pattern — pick one to explore.
        </p>
      </section>

      {/* Tool grid */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group relative bg-white rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all duration-200"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-3 group-hover:text-indigo-700 transition-colors">
                {tool.title}
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
