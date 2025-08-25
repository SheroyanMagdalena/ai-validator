"use client";
import React, { useEffect, useRef, useState } from "react";

type Match = { apiField: string; modelField: string; confidence?: number; reason?: string };
type CompareResult = {
  matches?: Match[];
  apiOnly?: string[];
  modelOnly?: string[];
  unresolved?: Match[];
  raw?: string;
};

type Stage = "idle" | "upload" | "parsing" | "matching" | "report";

export default function HomePage() {
  const [apiFile, setApiFile] = useState<File | null>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // progress + timer + stage
  const [progress, setProgress] = useState(0); // 0-100
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const progressRef = useRef<number | null>(null);

  // results UI
  const [activeTab, setActiveTab] = useState<"overview" | "matches" | "unresolved" | "api" | "model">("overview");

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

  function beginTimers() {
    setProgress(0);
    setElapsedMs(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (progressRef.current) window.clearInterval(progressRef.current);

    startRef.current = Date.now();
    setStage("parsing");
    timerRef.current = window.setInterval(() => {
      if (!startRef.current) return;
      setElapsedMs(Date.now() - startRef.current);
    }, 100);

    // Simulated determinate progress up to 90%, completes to 100% on finish
    progressRef.current = window.setInterval(() => {
      setProgress((p) => {
        const next = p < 90 ? p + 1 : 90;
        // map progress to stage
        if (next >= 60 && stage !== "matching") setStage("matching");
        else if (next >= 10 && stage === "parsing") setStage("parsing");
        return next;
      });
    }, 100);
  }

  function endTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (progressRef.current) window.clearInterval(progressRef.current);
    timerRef.current = null;
    progressRef.current = null;
    setProgress(100);
    setStage("report");
    if (startRef.current) setElapsedMs(Date.now() - startRef.current);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (progressRef.current) window.clearInterval(progressRef.current);
    };
  }, []);

  // Reflect "Upload" step when both files are selected
  useEffect(() => {
    if (!loading && apiFile && modelFile && progress === 0) setStage("upload");
  }, [apiFile, modelFile, loading, progress]);

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
    beginTimers();
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
      setActiveTab("overview");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      endTimers();
      setLoading(false);
    }
  }

  // Safe defaults
  const matches = result?.matches ?? [];
  const apiOnly = result?.apiOnly ?? [];
  const modelOnly = result?.modelOnly ?? [];
  const unresolved = result?.unresolved ?? [];

  const totalCompared = matches.length + unresolved.length + apiOnly.length + modelOnly.length;
  const denom = matches.length + unresolved.length;
  const accuracyPct = denom > 0 ? Math.round((matches.length / denom) * 100) : null;

  return (
    <main className="max-w-5xl mx-auto my-10 p-6">
      {/* Sticky header with stepper + progress */}
      {(loading || progress > 0) && (
        <div className="sticky top-0 z-40 -mt-6 mb-6 pt-4 pb-3 bg-white/70 dark:bg-gray-900/70 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-5xl mx-auto px-6 flex items-center justify-between gap-4">
            <StepProgress stage={stage} />
            <div className="text-sm text-gray-700 dark:text-gray-300 tabular-nums">
              {progress}% • {formatDuration(elapsedMs)}
            </div>
          </div>
          <div className="max-w-5xl mx-auto px-6 mt-2">
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-2 bg-blue-600 dark:bg-blue-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold mb-2 tracking-tight">AI Validator – Compare API vs Data Model</h1>
      <p className="text-lg text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        Upload your API sample/spec (JSON/YAML) and Data Model (JSON schema). Drag & drop files or paste JSON directly into the zones.
      </p>

      <form
        onSubmit={handleSubmit}
        className="grid gap-6 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 mb-8"
      >
        {/* Drag & Drop + Paste: API file */}
        <div className="grid gap-2">
          <span className="font-medium text-lg">API file (.json / .yaml)</span>
          <DropZone
            accept={[".json", ".yaml", ".yml", "application/json", "text/yaml"]}
            fileName={apiFile?.name}
            onFile={setApiFile}
            pasteHint="Paste JSON here (⌘/Ctrl+V)"
          />
        </div>

        {/* Drag & Drop + Paste: Data model */}
        <div className="grid gap-2">
          <span className="font-medium text-lg">Data model file (.json)</span>
          <DropZone
            accept={[".json", "application/json"]}
            fileName={modelFile?.name}
            onFile={setModelFile}
            pasteHint="Paste JSON here (⌘/Ctrl+V)"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !apiFile || !modelFile}
            className={`px-6 py-3 rounded text-white text-lg font-medium transition 
            ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"}`}
          >
            {loading ? `Comparing…` : "Compare"}
          </button>
          {(result || apiFile || modelFile) && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setShowModal(false);
                setProgress(0);
                setElapsedMs(0);
                setApiFile(null);
                setModelFile(null);
                setStage("idle");
                setActiveTab("overview");
              }}
              className="px-4 py-3 rounded border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Reset
            </button>
          )}
        </div>

        {error && <div className="text-red-600 text-lg mt-2">{error}</div>}
      </form>

      {/* Results */}
      {result && (
        <>
          <Tabs
            tabs={[
              { key: "overview", label: "Overview", count: totalCompared },
              { key: "matches", label: "Matches", count: matches.length },
              { key: "unresolved", label: "Unresolved", count: unresolved.length },
              { key: "api", label: "API-only", count: apiOnly.length },
              { key: "model", label: "Model-only", count: modelOnly.length },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as typeof activeTab)}
          />

          {activeTab === "overview" && (
            <>
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <StatTile label="Total" value={totalCompared} />
                <StatTile label="Matches" value={matches.length} accent="green" />
                <StatTile label="Unresolved" value={unresolved.length} accent="yellow" />
                <StatTile label="API↗︎ Only" value={apiOnly.length} accent="blue" />
                <StatTile label="Model↘︎ Only" value={modelOnly.length} accent="purple" />
              </section>

              <div className="grid sm:grid-cols-2 gap-6 mb-8">
                <div className="p-4 border rounded-xl bg-white dark:bg-gray-900">
                  <h3 className="text-lg font-semibold mb-3">Distribution</h3>
                  <DonutChart
                    segments={[
                      { label: "Matches", value: matches.length, color: "#22c55e" },   // green-500
                      { label: "Unresolved", value: unresolved.length, color: "#f59e0b" }, // amber-500
                      { label: "API-only", value: apiOnly.length, color: "#3b82f6" },  // blue-500
                      { label: "Model-only", value: modelOnly.length, color: "#8b5cf6" }, // violet-500
                    ]}
                  />
                </div>
                <div className="p-4 border rounded-xl bg-white dark:bg-gray-900 flex flex-col justify-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Accuracy (Matches ÷ (Matches + Unresolved))</div>
                  <div className="text-4xl font-semibold">{accuracyPct !== null ? `${accuracyPct}%` : "—"}</div>
                </div>
              </div>
            </>
          )}

          {activeTab === "matches" && (
            <div className="p-4 border rounded bg-white dark:bg-gray-900 shadow-sm">
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
                {matches.length === 0 && <EmptyState text="No matches yet." />}
              </div>
            </div>
          )}

          {activeTab === "unresolved" && (
            <div className="p-4 border rounded bg-white dark:bg-gray-900 shadow-sm">
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
                {unresolved.length === 0 && <EmptyState text="Nothing unresolved. 🎉" />}
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <ListSection title={`API Only (${apiOnly.length})`} items={apiOnly} color="blue" />
          )}

          {activeTab === "model" && (
            <ListSection title={`Model Only (${modelOnly.length})`} items={modelOnly} color="green" />
          )}
        </>
      )}

      {/* Modal for report and output */}
      {result && showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <ReportOutput result={result} />
        </Modal>
      )}

      {/* Show button to open modal if result exists */}
      {result && !showModal && (
        <div className="flex justify-end mt-6">
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
}

function formatDuration(ms: number) {
  const sec = Math.floor(ms / 1000);
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/* --------------------------- UI Building Blocks --------------------------- */

function StepProgress({ stage }: { stage: Stage }) {
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "parsing", label: "Parsing" },
    { key: "matching", label: "Matching" },
    { key: "report", label: "Report" },
  ] as const;

  const idx = steps.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const chip = done
          ? "bg-green-50 border-green-200 text-green-800"
          : active
          ? "bg-blue-50 border-blue-200 text-blue-800"
          : "bg-gray-50 border-gray-200 text-gray-600";
        const dot = done ? "bg-green-500" : active ? "bg-blue-500" : "bg-gray-300";

        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className={`h-8 px-3 rounded-full text-sm flex items-center gap-2 border ${chip}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="w-6 h-[2px] bg-gray-200 dark:bg-gray-700" />}
          </div>
        );
      })}
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 mb-4 flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm rounded-t transition
            ${
              active === t.key
                ? "bg-white dark:bg-gray-900 border-x border-t border-gray-200 dark:border-gray-800 font-medium"
                : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
            }`}
        >
          <span>{t.label}</span>
          {typeof t.count === "number" && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-800">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = Math.max(segments.reduce((s, x) => s + x.value, 0), 1); // avoid 0
  const R = 54; // radius
  const C = 2 * Math.PI * R;
  const stroke = 12;
  let acc = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" width="140" height="140" className="shrink-0">
        <g transform="rotate(-90 70 70)">
          {/* track */}
          <circle cx="70" cy="70" r={R} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          {segments.map((s, i) => {
            const len = (s.value / total) * C;
            const dasharray = `${len} ${C - len}`;
            const offset = (acc / total) * C;
            acc += s.value;
            return (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={dasharray}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })}
        </g>
      </svg>
      <ul className="space-y-2">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-[6rem]">{s.label}</span>
            <span className="tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-6 text-center text-gray-500 dark:text-gray-400 border rounded bg-gray-50 dark:bg-gray-800">
      {text}
    </div>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "green" | "yellow" | "blue" | "purple";
}) {
  const colors: Record<string, string> = {
    green: "bg-green-50 dark:bg-green-900 text-green-900 dark:text-green-100 border-green-200 dark:border-green-800",
    yellow: "bg-yellow-50 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 border-yellow-200 dark:border-yellow-800",
    blue: "bg-blue-50 dark:bg-blue-900 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800",
    purple: "bg-purple-50 dark:bg-purple-900 text-purple-900 dark:text-purple-100 border-purple-200 dark:border-purple-800",
  };
  const base = "bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800";
  return (
    <div className={`p-4 rounded-xl border ${accent ? colors[accent] : base}`}>
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

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

  async function handleDownload() {
    try {
      let parsedResult: any = result;
      if (result && typeof result.raw === "string") {
        let rawStr = result.raw.trim();
        if (rawStr.startsWith("```json")) {
          rawStr = rawStr.replace(/^```json/, "").replace(/```$/, "").trim();
        } else if (rawStr.startsWith("```")) {
          rawStr = rawStr.replace(/^```/, "").replace(/```$/, "").trim();
        }
        try {
          parsedResult = JSON.parse(rawStr);
        } catch (e) {
          alert("Failed to parse the report data.");
          return;
        }
      }

      const reportPayload = {
        api_name: parsedResult.api_name || "API vs Model Comparison",
        validation_date: parsedResult.validation_date || new Date().toISOString(),
        total_fields_compared:
          parsedResult.total_fields_compared ??
          (parsedResult.matches?.length ?? 0) +
            (parsedResult.unresolved?.length ?? 0) +
            (parsedResult.apiOnly?.length ?? 0) +
            (parsedResult.modelOnly?.length ?? 0),
        matched_fields: parsedResult.matched_fields ?? parsedResult.matches?.length ?? 0,
        unmatched_fields: parsedResult.unmatched_fields ?? parsedResult.unresolved?.length ?? 0,
        extra_fields: parsedResult.extra_fields ?? parsedResult.apiOnly?.length ?? 0,
        missing_fields: parsedResult.missing_fields ?? parsedResult.modelOnly?.length ?? 0,
        accuracy_score:
          parsedResult.accuracy_score ??
          (parsedResult.matches && parsedResult.matches.length + (parsedResult.unresolved?.length ?? 0) > 0
            ? Math.round(((parsedResult.matches.length ?? 0) / ((parsedResult.matches.length ?? 0) + (parsedResult.unresolved?.length ?? 0))) * 100)
            : null),
        summary_recommendation: parsedResult.summary_recommendation || "See details below.",
        fields:
          parsedResult.fields ||
          [
            ...(parsedResult.matches?.map((m: any) => ({
              field_name: m.apiField,
              status: "matched",
              expected_type: "",
              actual_type: "",
              issue: "",
              suggestion: m.reason || "",
            })) ?? []),
            ...(parsedResult.unresolved?.map((u: any) => ({
              field_name: u.apiField,
              status: "unmatched",
              expected_type: "",
              actual_type: "",
              issue: u.reason || "",
              suggestion: "",
            })) ?? []),
            ...(parsedResult.apiOnly?.map((f: any) => ({
              field_name: f,
              status: "extra",
              expected_type: "",
              actual_type: "",
              issue: "API only field",
              suggestion: "Check if needed in model",
            })) ?? []),
            ...(parsedResult.modelOnly?.map((f: any) => ({
              field_name: f,
              status: "missing",
              expected_type: "",
              actual_type: "",
              issue: "Model only field",
              suggestion: "Check if needed in API",
            })) ?? []),
          ],
      };

      const res = await fetch("http://localhost:3200/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportPayload),
      });
      if (!res.ok) {
        throw new Error("Failed to generate PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "comparison-report.pdf";
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
        {result.raw && (
          <div className={`p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded shadow-sm font-mono text-base`}>
            <strong className="text-lg">Note:</strong> Model returned non-JSON. Showing raw output:
            <pre className="mt-2 whitespace-pre-wrap">{result.raw}</pre>
          </div>
        )}

        {matches.length > 0 && (
          <div className={`p-4 border rounded bg-white dark:bg-gray-900 shadow-sm`}>
            <h2 className="text-2xl font-semibold mb-4">Matches ({matches.length})</h2>
            <div className="space-y-3">
              {matches.map((m, idx) => (
                <div key={idx} className="p-3 border rounded bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg mb-1">
                    <strong>API Field:</strong> {m.apiField}
                  </div>
                  <div className="text-lg mb-1">
                    <strong>Model Field:</strong> {m.modelField}
                  </div>
                  <div className={`text-lg mb-1 ${m.confidence && m.confidence > 0.8 ? "text-green-700" : "text-red-600"}`}>
                    <strong>Confidence:</strong> {m.confidence ?? "—"}
                  </div>
                  {m.reason && (
                    <div className="text-lg">
                      <strong>Reason:</strong> {m.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {apiOnly.length > 0 && (
          <div>
            <ListSection title={`API Only (${apiOnly.length})`} items={apiOnly} color="blue" />
          </div>
        )}

        {modelOnly.length > 0 && (
          <div>
            <ListSection title={`Model Only (${modelOnly.length})`} items={modelOnly} color="green" />
          </div>
        )}

        {unresolved.length > 0 && (
          <div className={`p-4 border rounded bg-white dark:bg-gray-900 shadow-sm`}>
            <h2 className="text-2xl font-semibold mb-4">Unresolved ({unresolved.length})</h2>
            <div className="space-y-3">
              {unresolved.map((u, i) => (
                <div key={i} className="p-3 border rounded bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg mb-1">
                    <strong>API Field:</strong> {u.apiField}
                  </div>
                  <div className="text-lg mb-1">
                    <strong>Candidate Model Field:</strong> {u.modelField ?? "—"}
                  </div>
                  <div className="text-lg mb-1">
                    <strong>Confidence:</strong> {u.confidence ?? "—"}
                  </div>
                  {u.reason && (
                    <div className="text-lg">
                      <strong>Reason:</strong> {u.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: "blue" | "green" }) {
  const bg = color === "blue" ? "bg-blue-50 dark:bg-blue-900" : "bg-green-50 dark:bg-green-900";
  return (
    <div className="p-4 border rounded shadow-sm bg-white dark:bg-gray-900">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      {items.length === 0 ? (
        <EmptyState text="No items." />
      ) : (
        <ul className="list-disc pl-5 space-y-2 text-lg leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx} className={`${bg} p-2 rounded`}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Drag & Drop / Paste zone component
 */
function DropZone({
  accept,
  fileName,
  onFile,
  pasteHint = "Paste here",
}: {
  accept: string[];
  fileName?: string;
  onFile: (f: File) => void;
  pasteHint?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);

  function matchesAccept(file: File) {
    const name = file.name.toLowerCase();
    const type = file.type;
    return accept.some((a) => (a.startsWith(".") ? name.endsWith(a) : type === a));
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!matchesAccept(file)) {
      setError(`Unsupported file type: ${file.type || file.name}`);
      return;
    }
    setError(null);
    onFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData.getData("text");
    if (text) {
      try {
        const parsed = JSON.parse(text);
        const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
        const file = new File([blob], `pasted-${Date.now()}.json`, { type: "application/json" });
        setError(null);
        onFile(file);
      } catch (err) {
        setError("Pasted text is not valid JSON");
      }
    }
  }

  function handlePick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.onchange = () => handleFiles(input.files);
    input.click();
  }

  return (
    <div className="space-y-2">
      <div
        ref={zoneRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handlePick();
        }}
        className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer select-none
          ${dragOver ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30" : "border-gray-300 dark:border-gray-700"}
          hover:border-blue-500`}
        onClick={handlePick}
        aria-label="Upload or paste file"
      >
        <span className="text-base text-gray-700 dark:text-gray-300">
          Drop file here, <span className="underline">click to browse</span>, or <span className="font-medium">{pasteHint}</span>
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">Accepted: {accept.join(", ")}</span>
        {fileName && (
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm mt-2">
            Selected: {fileName}
          </span>
        )}
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
    </div>
  );
}
