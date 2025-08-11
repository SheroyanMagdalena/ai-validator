"use client";

import { useState } from "react";

type Match = { apiField: string; modelField: string; confidence?: number; reason?: string };
type CompareResult = {
  matches: Match[];
  apiOnly: string[];
  modelOnly: string[];
  unresolved?: Match[]; // optional if you add abstention later
  raw?: string;         // fallback if model returned plain text
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
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>AI Validator – Compare API vs Data Model</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        Upload your API sample/spec (JSON/YAML) and Data Model (JSON schema). We’ll compare fields and show matches & differences.
      </p>

      <form onSubmit={handleSubmit} style={{
        display: "grid",
        gap: 16,
        padding: 16,
        border: "1px solid #eee",
        borderRadius: 12
      }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span>API file (.json / .yaml)</span>
          <input
            type="file"
            accept=".json,.yaml,.yml,application/json,text/yaml"
            onChange={(e) => setApiFile(e.target.files?.[0] || null)}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span>Data model file (.json)</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => setModelFile(e.target.files?.[0] || null)}
          />
        </label>

        <button
          type="submit"
          disabled={loading || !apiFile || !modelFile}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #222",
            background: loading ? "#f3f3f3" : "#111",
            color: loading ? "#333" : "#fff",
            cursor: loading ? "default" : "pointer"
          }}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>

        {error && <div style={{ color: "crimson" }}>{error}</div>}
      </form>

      {result && (
        <section style={{ marginTop: 32, display: "grid", gap: 24 }}>
          {"raw" in result && result.raw && (
            <div style={{ background: "#fff6e5", border: "1px solid #ffe3ad", padding: 12, borderRadius: 8 }}>
              <strong>Note:</strong> Model returned non-JSON. Showing raw output:
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{result.raw}</pre>
            </div>
          )}

          {result.matches?.length > 0 && (
            <div>
              <h2>Matches ({result.matches.length})</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>API Field</th>
                      <th style={th}>Model Field</th>
                      <th style={th}>Confidence</th>
                      <th style={th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matches.map((m, idx) => (
                      <tr key={idx}>
                        <td style={td}>{m.apiField}</td>
                        <td style={td}>{m.modelField}</td>
                        <td style={td}>{m.confidence ?? ""}</td>
                        <td style={td}>{m.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.apiOnly?.length > 0 && (
            <div>
              <h2>API Only ({result.apiOnly.length})</h2>
              <TagList items={result.apiOnly} />
            </div>
          )}

          {result.modelOnly?.length > 0 && (
            <div>
              <h2>Model Only ({result.modelOnly.length})</h2>
              <TagList items={result.modelOnly} />
            </div>
          )}

          {result.unresolved?.length ? (
            <div>
              <h2>Unresolved ({result.unresolved.length})</h2>
              <div style={{ display: "grid", gap: 6 }}>
                {result.unresolved.map((u, i) => (
                  <div key={i} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
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

const th: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "8px 6px"
};

const td: React.CSSProperties = {
  borderBottom: "1px solid #f3f3f3",
  padding: "8px 6px"
};

function TagList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {items.map((t, i) => (
        <span key={i} style={{
          background: "#f5f5f5",
          border: "1px solid #eee",
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 14
        }}>
          {t}
        </span>
      ))}
    </div>
  );
}
