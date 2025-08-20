"use client";
import React, { useState } from "react";

type Match = { apiField: string; modelField: string; confidence?: number; reason?: string };
type CompareResult = {
  matches?: Match[];
  apiOnly?: string[];
  modelOnly?: string[];
  unresolved?: Match[];
  raw?: string;
};

export default function HomePage() {
  const [apiFile, setApiFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  // Safe defaults
  const matches = result?.matches ?? [];
  const apiOnly = result?.apiOnly ?? [];
  const modelOnly = result?.modelOnly ?? [];
  const unresolved = result?.unresolved ?? [];

  return (
    <main className="max-w-4xl mx-auto my-10 p-6">
      <h1 className="text-3xl font-bold mb-4">AI Validator – Compare API vs Data Model</h1>
      <p className="text-lg text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
        Upload your API sample/spec (JSON/YAML) and Data Model (JSON schema). We’ll compare fields and show matches & differences.
      </p>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 mb-8"
      >
        {/* Custom file input for API file */}
        <div className="grid gap-2">
          <span className="font-medium text-lg">API file (.json / .yaml)</span>
          <div className="flex items-center gap-3">
            <label className="relative inline-block w-fit">
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml"
                onChange={(e) => setApiFile(e.target.files?.[0] || null)}
                className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer z-10"
                tabIndex={-1}
              />
              <span className="inline-block px-5 py-2 rounded bg-gray-500 text-white font-medium cursor-pointer hover:bg-gray-700 transition">
                Choose File
              </span>
            </label>
            <button
              type="button"
              className="inline-block px-4 py-2 rounded bg-gray-400 text-white font-medium cursor-pointer hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!apiFile}
              onClick={() => {
                if (apiFile) {
                  const url = URL.createObjectURL(apiFile);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = apiFile.name;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }, 100);
                }
              }}
            >
              Download
            </button>
          </div>
          <span className="text-base text-gray-700 dark:text-gray-300 mt-1 min-h-[1.5em]">
            {apiFile ? apiFile.name : <span className="text-gray-400">No file chosen</span>}
          </span>
        </div>

        {/* Custom file input for Data model file */}
        <div className="grid gap-2">
          <span className="font-medium text-lg">Data model file (.json)</span>
          <div className="flex items-center gap-3">
            <label className="relative inline-block w-fit">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => setModelFile(e.target.files?.[0] || null)}
                className="absolute left-0 top-0 w-full h-full opacity-0 cursor-pointer z-10"
                tabIndex={-1}
              />
              <span className="inline-block px-5 py-2 rounded bg-gray-500 text-white font-medium cursor-pointer hover:bg-gray-700 transition">
                Choose File
              </span>
            </label>
            <button
              type="button"
              className="inline-block px-4 py-2 rounded bg-gray-400 text-white font-medium cursor-pointer hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!modelFile}
              onClick={() => {
                if (modelFile) {
                  const url = URL.createObjectURL(modelFile);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = modelFile.name;
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }, 100);
                }
              }}
            >
              Download
            </button>
          </div>
          <span className="text-base text-gray-700 dark:text-gray-300 mt-1 min-h-[1.5em]">
            {modelFile ? modelFile.name : <span className="text-gray-400">No file chosen</span>}
          </span>
        </div>

        <button
          type="submit"
          disabled={loading || !apiFile || !modelFile}
          className={`px-6 py-3 rounded border text-white text-lg font-medium transition 
            ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"}
          `}
        >
          {loading ? "Comparing…" : "Compare"}
        </button>

        {error && <div className="text-red-600 text-lg mt-2">{error}</div>}
      </form>

      {/* Modal for report and output */}
      {result && showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <ReportOutput result={result} />
        </Modal>
      )}

      {/* Show button to open modal if result exists */}
      {result && !showModal && (
        <div className="flex justify-end">
          <button
            className="px-6 py-3 rounded border text-white text-lg font-medium bg-blue-700 hover:bg-blue-800 shadow"
            onClick={() => setShowModal(true)}
          >
            View Report & Output
          </button>
        </div>
      )}
    </main>
  );

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative p-8">
        <button
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 dark:hover:text-white text-2xl font-bold"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

function ReportOutput({ result }: { result: CompareResult }) {
  const matches = result?.matches ?? [];
  const apiOnly = result?.apiOnly ?? [];
  const modelOnly = result?.modelOnly ?? [];
  const unresolved = result?.unresolved ?? [];
  // Custom font and size for report
  const reportFont = "font-[ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace] text-[1.5rem]";

  async function handleDownload() {
    try {
      // Debug: log the result object
      console.log("Current result object:", result);

      // If result.raw exists and looks like JSON, parse it
      let parsedResult: any = result;
      if (result && typeof result.raw === 'string') {
        // Remove markdown code block if present
        let rawStr = result.raw.trim();
        if (rawStr.startsWith('```json')) {
          rawStr = rawStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (rawStr.startsWith('```')) {
          rawStr = rawStr.replace(/^```/, '').replace(/```$/, '').trim();
        }
        try {
          parsedResult = JSON.parse(rawStr);
        } catch (e) {
          console.error('Failed to parse result.raw as JSON:', e, rawStr);
          alert('Failed to parse the report data.');
          return;
        }
      }

      // Map parsedResult to ReportInput schema expected by backend
      const reportPayload = {
        api_name: parsedResult.api_name || "API vs Model Comparison",
        validation_date: parsedResult.validation_date || new Date().toISOString(),
        total_fields_compared: parsedResult.total_fields_compared ?? ((parsedResult.matches?.length ?? 0) + (parsedResult.unresolved?.length ?? 0) + (parsedResult.apiOnly?.length ?? 0) + (parsedResult.modelOnly?.length ?? 0)),
        matched_fields: parsedResult.matched_fields ?? parsedResult.matches?.length ?? 0,
        unmatched_fields: parsedResult.unmatched_fields ?? parsedResult.unresolved?.length ?? 0,
        extra_fields: parsedResult.extra_fields ?? parsedResult.apiOnly?.length ?? 0,
        missing_fields: parsedResult.missing_fields ?? parsedResult.modelOnly?.length ?? 0,
        accuracy_score: parsedResult.accuracy_score ?? (parsedResult.matches && parsedResult.matches.length + (parsedResult.unresolved?.length ?? 0) > 0
          ? Math.round(((parsedResult.matches.length ?? 0) / ((parsedResult.matches.length ?? 0) + (parsedResult.unresolved?.length ?? 0))) * 100)
          : null),
        summary_recommendation: parsedResult.summary_recommendation || "See details below.",
        fields: parsedResult.fields || [
          ...(parsedResult.matches?.map((m: any) => ({
            field_name: m.apiField,
            status: "matched",
            expected_type: "",
            actual_type: "",
            issue: "",
            suggestion: m.reason || ""
          })) ?? []),
          ...(parsedResult.unresolved?.map((u: any) => ({
            field_name: u.apiField,
            status: "unmatched",
            expected_type: "",
            actual_type: "",
            issue: u.reason || "",
            suggestion: ""
          })) ?? []),
          ...(parsedResult.apiOnly?.map((f: any) => ({
            field_name: f,
            status: "extra",
            expected_type: "",
            actual_type: "",
            issue: "API only field",
            suggestion: "Check if needed in model"
          })) ?? []),
          ...(parsedResult.modelOnly?.map((f: any) => ({
            field_name: f,
            status: "missing",
            expected_type: "",
            actual_type: "",
            issue: "Model only field",
            suggestion: "Check if needed in API"
          })) ?? []),
        ]
      };
      // Debug: log the payload being sent
      console.log("Sending to backend:", reportPayload);
      const res = await fetch("http://localhost:3200/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportPayload),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Backend error:", errorText);
        throw new Error("Failed to generate PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comparison-report.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      alert("Failed to download PDF report. Check the console for backend error details.");
    }
  }

  return (
    <>
      <div className="flex justify-end mb-6">
        <button
          className="px-5 py-2 rounded bg-gray-500 text-white font-medium hover:bg-gray-700 transition"
          onClick={handleDownload}
        >
          Download Report
        </button>
      </div>
      <section className="space-y-10">
        {/* Raw output */}
        {result.raw && (
          <div className={`p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded shadow-sm ${reportFont}`}>
            <strong className="text-lg">Note:</strong> Model returned non-JSON. Showing raw output:
            <pre className="mt-2 whitespace-pre-wrap font-mono text-base">{result.raw}</pre>
          </div>
        )}

        {/* Matches */}
        {matches.length > 0 && (
          <div className={`p-4 border rounded bg-white dark:bg-gray-900 shadow-sm ${reportFont}`}>
            <h2 className="text-2xl font-semibold mb-4">Matches ({matches.length})</h2>
            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div key={idx} className="p-3 border rounded bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg mb-1"><strong>API Field:</strong> {m.apiField}</div>
                  <div className="text-lg mb-1"><strong>Model Field:</strong> {m.modelField}</div>
                  <div className={`text-lg mb-1 ${m.confidence && m.confidence > 0.8 ? "text-green-700" : "text-red-600"}`}>
                    <strong>Confidence:</strong> {m.confidence ?? "—"}
                  </div>
                  {m.reason && <div className="text-lg"><strong>Reason:</strong> {m.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Only */}
        {apiOnly.length > 0 && (
          <div className={reportFont}>
            <ListSection title={`API Only (${apiOnly.length})`} items={apiOnly} color="blue" />
          </div>
        )}

        {/* Model Only */}
        {modelOnly.length > 0 && (
          <div className={reportFont}>
            <ListSection title={`Model Only (${modelOnly.length})`} items={modelOnly} color="green" />
          </div>
        )}

        {/* Unresolved */}
        {unresolved.length > 0 && (
          <div className={`p-4 border rounded bg-white dark:bg-gray-900 shadow-sm ${reportFont}`}>
            <h2 className="text-2xl font-semibold mb-4">Unresolved ({unresolved.length})</h2>
            <div className="space-y-3">
              {unresolved.map((u, i) => (
                <div key={i} className="p-3 border rounded bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg mb-1"><strong>API Field:</strong> {u.apiField}</div>
                  <div className="text-lg mb-1"><strong>Candidate Model Field:</strong> {u.modelField ?? "—"}</div>
                  <div className="text-lg mb-1"><strong>Confidence:</strong> {u.confidence ?? "—"}</div>
                  {u.reason && <div className="text-lg"><strong>Reason:</strong> {u.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: "blue" | "green" }) {
  const bg = color === "blue" ? "bg-blue-50 dark:bg-blue-900" : "bg-green-50 dark:bg-green-900";
  return (
    <div className="p-4 border rounded shadow-sm">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <ul className="list-disc pl-5 space-y-2 text-lg leading-relaxed">
        {items.map((item, idx) => (
          <li key={idx} className={`${bg} p-2 rounded`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
