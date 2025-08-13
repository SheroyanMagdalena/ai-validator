"use client";

import { useState } from "react";

type Match = { apiField: string; modelField: string; confidence?: number; reason?: string };
type CompareResult = {
  matches: Match[];
  apiOnly: string[];
  modelOnly: string[];
  unresolved?: Match[];
  raw?: string;
};

export default function HomePage() {
  const [apiFile, setApiFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!apiFile || !modelFile) {
      setError("Please select both files.");
      return;
    }

    const form = new FormData();
    form.append("apiFile", apiFile);
    form.append("modelFile", modelFile);

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/comparison/upload`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto my-10 p-6">
      <h1 className="text-2xl font-bold mb-3">AI Validator – Compare API vs Data Model</h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Upload your API sample/spec (JSON/YAML) and Data Model (JSON schema). We’ll compare fields and show matches & differences.
      </p>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900"
      >
        <label className="grid gap-2">
          <span className="font-medium">API file (.json / .yaml)</span>
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,text/yaml"
            onChange={(e) => setApiFile(e.target.files?.[0] || null)}
            className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-800"
          />
        </label>

        <label className="grid gap-2">
          <span className="font-medium">Data model file (.json)</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => setModelFile(e.target.files?.[0] || null)}
            className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-800"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !apiFile || !modelFile}
          className={`px-4 py-2 rounded border text-white transition 
            ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"}
          `}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>

        {error && <div className="text-red-600">{error}</div>}
      </form>

      {result && (
        <section className="mt-8 grid gap-6">
          {result.raw && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded">
              <strong>Note:</strong> Model returned non-JSON. Showing raw output:
              <pre className="whitespace-pre-wrap mt-2">{result.raw}</pre>
            </div>
          )}

          {result.matches?.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Matches ({result.matches.length})</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-800">
                      <th className="text-left border-b p-2">API Field</th>
                      <th className="text-left border-b p-2">Model Field</th>
                      <th className="text-left border-b p-2">Confidence</th>
                      <th className="text-left border-b p-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((m, idx) => (
                      <tr key={idx} className="border-b border-gray-200 dark:border-gray-700">
                        <td className="p-2">{m.apiField}</td>
                        <td className="p-2">{m.modelField}</td>
                        <td className="p-2">{m.confidence ?? ""}</td>
                        <td className="p-2">{m.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.apiOnly?.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-2">API Only ({result.apiOnly.length})</h2>
              <TagList items={result.apiOnly} />
            </div>
          )}

          {result.modelOnly?.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-2">Model Only ({result.modelOnly.length})</h2>
              <TagList items={result.modelOnly} />
            </div>
          )}

          {result.unresolved?.length ? (
            <div>
              <h2 className="text-xl font-semibold mb-2">Unresolved ({result.unresolved.length})</h2>
              <div className="grid gap-2">
                {result.unresolved.map((u, i) => (
                  <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                    <div><strong>API Field:</strong> {u.apiField}</div>
                    <div><strong>Candidate Model Field:</strong> {u.modelField ?? "—"}</div>
                    <div><strong>Confidence:</strong> {u.confidence ?? "—"}</div>
                    {u.reason && <div><strong>Reason:</strong> {u.reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

function TagList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t, i) => (
        <span
          key={i}
          className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1 text-sm"
        >
          {t}
        </span>
      ))}
    </div>
  );
}
