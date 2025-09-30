"use client";

import React, { useEffect, useRef, useState } from "react";

// Types
type FieldAnalysis = {
  field_name: string;
  status: 'matched' | 'unresolved' | 'extra' | 'missing';
  expected_type: string;
  actual_type: string;
  expected_format: string | null;
  actual_format: string | null;
  issue: string;
  suggestion: string;
  confidence: number;
  rationale: string;
};

type CompareResult = {
  api_name: string;
  validation_date: string;
  total_fields_compared: number;
  matched_fields: number;
  unresolved_fields: number;
  extra_fields: number;
  missing_fields: number;
  accuracy_score: number;
  fields: FieldAnalysis[];
  summary_recommendation?: string;
};

type UploadResponse = {
  success: boolean;
  message?: string;
  document_type?: 'openapi' | 'data-model' | 'unknown';
  comparison_result?: CompareResult;
  timestamp: string;
};

type Stage = "idle" | "upload" | "parsing" | "matching" | "report";

// Main component
export default function HomePage() {
  // File states
  const [apiFile, setApiFile] = useState<File | null>(null);

  // Loading & result states
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Modal & tab states
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "matched" | "unresolved" | "extra" | "missing">("overview");

  // Progress & timer states
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stage, setStage] = useState<Stage>("idle");
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const progressRef = useRef<number | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

  // Helper: start timers and progress
  const beginTimers = () => {
    setProgress(0);
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    startRef.current = Date.now();
    setStage("parsing");
    timerRef.current = window.setInterval(() => {
      if (startRef.current) {
        setElapsedMs(Date.now() - startRef.current);
      }
    }, 100);
    progressRef.current = window.setInterval(() => {
      setProgress((p) => {
        const next = p < 90 ? p + 1 : 90;
        if (next >= 60 && stage !== "matching") setStage("matching");
        else if (next >= 10 && stage === "parsing") setStage("parsing");
        return next;
      });
    }, 100);
  };

  // Helper: end timers and set report stage
  const endTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    timerRef.current = null;
    progressRef.current = null;
    setProgress(100);
    setStage("report");
    if (startRef.current) setElapsedMs(Date.now() - startRef.current);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

// When file is selected, set stage to "upload"
useEffect(() => {
  if (!loading && apiFile && progress === 0) {
    setStage("upload");
  }
}, [apiFile, loading, progress]);


  // Handle form submit to upload files for comparison
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);
  setInfoMessage(null);

  if (!apiFile) {
    setError("Please select an API file.");
    return;
  }

  setResult(null);
  const formData = new FormData();
  formData.append("file", apiFile);

  setLoading(true);
  beginTimers();

  try {
    const res = await fetch(`${apiBase}/comparison/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    
    // Check if the response is an UploadResponse or direct CompareResult
    const data: UploadResponse | CompareResult = await res.json();
    
    // Check if it's an UploadResponse (has success field)
    if ('success' in data) {
      const uploadResponse = data as UploadResponse;
      if (!uploadResponse.success) {
        // Show the informational message instead of an error
        setInfoMessage(uploadResponse.message || 'Unable to process the uploaded file.');
        return;
      } else if (uploadResponse.comparison_result) {
        // Successful comparison wrapped in UploadResponse
        setResult(uploadResponse.comparison_result);
        setActiveTab("overview");
      }
    } else {
      // Direct CompareResult (backward compatibility)
      setResult(data as CompareResult);
      setActiveTab("overview");
    }
  } catch (err: any) {
    setError(err.message || "Something went wrong");
  } finally {
    endTimers();
    setLoading(false);
  }
};


  // Calculate stats for UI
  const matchedFields = result?.fields?.filter(f => f.status === 'matched') || [];
  const unresolvedFields = result?.fields?.filter(f => f.status === 'unresolved') || [];
  const extraFields = result?.fields?.filter(f => f.status === 'extra') || [];
  const missingFields = result?.fields?.filter(f => f.status === 'missing') || [];
  const totalCompared = result?.total_fields_compared || 0;
  const accuracyPct = result?.accuracy_score || 0;

  return (
    <main className="max-w-5xl mx-auto my-10 p-6">
      {/* Progress Bar & Stage Indicator */}
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

      {/* Header & Description */}
      <h1 className="text-3xl font-bold mb-2 tracking-tight">AI Validator – Compare API vs Data Model</h1>
      <p className="text-lg text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
        Upload your API sample/spec (JSON/YAML) and Data Model (JSON schema). Drag & drop files or paste JSON directly into the zones.
      </p>

      {/* Upload Form */}
<form
  onSubmit={handleSubmit}
  className="grid gap-6 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 mb-8"
>
  {/* API File DropZone */}
  <div className="grid gap-2">
    <span className="font-medium text-lg">API file (.json / .yaml)</span>
    <DropZone
      accept={[".json", ".yaml", ".yml", "application/json", "text/yaml"]}
      fileName={apiFile?.name}
      onFile={setApiFile}
      pasteHint="Paste JSON/YAML here (⌘/Ctrl+V)"
    />
  </div>

  {/* Buttons */}
  <div className="flex items-center gap-3">
    <button
      type="submit"
      disabled={loading || !apiFile}
      className={`px-6 py-3 rounded text-white text-lg font-medium transition ${
        loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-800"
      }`}
    >
      {loading ? "Comparing…" : "Compare"}
    </button>
    {result && (
      <button
        type="button"
        onClick={() => {
          setResult(null);
          setShowModal(false);
          setProgress(0);
          setElapsedMs(0);
          setApiFile(null);
          setStage("idle");
          setActiveTab("overview");
          setError(null);
          setInfoMessage(null);
        }}
        className="px-4 py-3 rounded border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Reset
      </button>
    )}
  </div>

  {/* Error message */}
  {error && <div className="text-red-600 text-lg mt-2">{error}</div>}
  
  {/* Info message for data models */}
  {infoMessage && (
    <div className="p-4 mt-4 border border-blue-200 bg-blue-50 dark:bg-blue-900 dark:border-blue-800 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">File Type Information</h3>
          <p className="text-blue-800 dark:text-blue-200">{infoMessage}</p>
        </div>
      </div>
    </div>
  )}
</form>

      {/* Results display */}
      {result && (
        <>
          <Tabs
            tabs={[
              { key: "overview", label: "Overview", count: totalCompared },
              { key: "matched", label: "Matched", count: matchedFields.length },
              { key: "unresolved", label: "Unresolved", count: unresolvedFields.length },
              { key: "extra", label: "Extra", count: extraFields.length },
              { key: "missing", label: "Missing", count: missingFields.length },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as typeof activeTab)}
          />

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {/* Stats Tiles */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <StatTile label="Total" value={totalCompared} />
                <StatTile label="Matched" value={matchedFields.length} accent="green" />
                <StatTile label="Unresolved" value={unresolvedFields.length} accent="yellow" />
                <StatTile label="Extra" value={extraFields.length} accent="blue" />
                <StatTile label="Missing" value={missingFields.length} accent="purple" />
              </section>

              {/* Distribution & Accuracy */}
              <div className="grid sm:grid-cols-2 gap-6 mb-8">
                {/* Pie Chart */}
                <div className="p-4 border rounded-xl bg-white dark:bg-gray-900">
                  <h3 className="text-lg font-semibold mb-3">Distribution</h3>
                  <DonutChart
                    segments={[
                      { label: "Matched", value: matchedFields.length, color: "#22c55e" },
                      { label: "Unresolved", value: unresolvedFields.length, color: "#f59e0b" },
                      { label: "Extra", value: extraFields.length, color: "#3b82f6" },
                      { label: "Missing", value: missingFields.length, color: "#8b5cf6" },
                    ]}
                  />
                </div>
                {/* Accuracy */}
                <div className="p-4 border rounded-xl bg-white dark:bg-gray-900 flex flex-col justify-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Accuracy Score
                  </div>
                  <div className="text-4xl font-semibold">{accuracyPct}%</div>
                </div>
              </div>

              {/* Summary Recommendation */}
              {result.summary_recommendation && (
                <div className="p-4 border rounded-xl bg-white dark:bg-gray-900 mb-8">
                  <h3 className="text-lg font-semibold mb-3">Summary Recommendation</h3>
                  <p className="text-gray-700 dark:text-gray-300">{result.summary_recommendation}</p>
                </div>
              )}
            </>
          )}

          {/* Matched Tab */}
          {activeTab === "matched" && (
            <FieldAnalysisList 
              title={`Matched Fields (${matchedFields.length})`} 
              fields={matchedFields} 
              status="matched"
            />
          )}

          {/* Unresolved Tab */}
          {activeTab === "unresolved" && (
            <FieldAnalysisList 
              title={`Unresolved Fields (${unresolvedFields.length})`} 
              fields={unresolvedFields} 
              status="unresolved"
            />
          )}

          {/* Extra Tab */}
          {activeTab === "extra" && (
            <FieldAnalysisList 
              title={`Extra Fields (${extraFields.length})`} 
              fields={extraFields} 
              status="extra"
            />
          )}

          {/* Missing Tab */}
          {activeTab === "missing" && (
            <FieldAnalysisList 
              title={`Missing Fields (${missingFields.length})`} 
              fields={missingFields} 
              status="missing"
            />
          )}
        </>
      )}

      {/* Modal for detailed report */}
      {result && showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <ReportOutput result={result} />
        </Modal>
      )}

      {/* Button to open modal for report */}
      {result && !showModal && (
        <div className="flex justify-end mt-6">
          <button
            className="px-6 py-3 rounded border text-white text-lg font-medium bg-blue-700 hover:bg-blue-800 shadow"
            onClick={() => setShowModal(true)}
          >
            View Detailed Report
          </button>
        </div>
      )}
    </main>
  );
}

// New component for displaying field analysis
function FieldAnalysisList({ title, fields, status }: { 
  title: string; 
  fields: FieldAnalysis[]; 
  status: FieldAnalysis['status'];
}) {
  const statusColors = {
    matched: "bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800",
    unresolved: "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-800",
    extra: "bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800",
    missing: "bg-purple-50 dark:bg-purple-900 border-purple-200 dark:border-purple-800",
  };

  return (
    <div className="p-4 border rounded bg-white dark:bg-gray-900 shadow-sm">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <div className="space-y-3">
        {fields.map((field, idx) => (
          <div key={idx} className={`p-4 border rounded ${statusColors[status]}`}>
            <div className="text-lg font-medium mb-2">{field.field_name}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div><span className="font-semibold">Status:</span> {field.status}</div>
              <div><span className="font-semibold">Expected Type:</span> {field.expected_type}</div>
              <div><span className="font-semibold">Actual Type:</span> {field.actual_type}</div>
              <div><span className="font-semibold">Confidence:</span> {field.confidence}</div>
            </div>
            {field.issue && (
              <div className="mt-2">
                <span className="font-semibold">Issue:</span> {field.issue}
              </div>
            )}
            {field.suggestion && (
              <div className="mt-2">
                <span className="font-semibold">Suggestion:</span> {field.suggestion}
              </div>
            )}
          </div>
        ))}
        {fields.length === 0 && <EmptyState text={`No ${status} fields.`} />}
      </div>
    </div>
  );
}

// Utility: format duration
function formatDuration(ms: number) {
  const sec = Math.floor(ms / 1000);
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/* --------------------------- UI Building Blocks --------------------------- */

// Progress Stepper
function StepProgress({ stage }: { stage: Stage }) {
  const steps = [
    { key: "upload", label: "Upload" },
    { key: "parsing", label: "Parsing" },
    { key: "matching", label: "Matching" },
    { key: "report", label: "Report" },
  ];

  const idx = steps.findIndex((s) => s.key === stage);

  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const chip =
          done
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

// Tabs component
function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-800 mb-4 flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm rounded-t transition ${
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

// Empty state component
function EmptyState({ text }: { text: string }) {
  return (
    <div className="p-6 text-center text-gray-500 dark:text-gray-400 border rounded bg-gray-50 dark:bg-gray-800">
      {text}
    </div>
  );
}

// Stat Tile
function StatTile({ label, value, accent }: { label: string; value: number | string; accent?: "green" | "yellow" | "blue" | "purple" }) {
  const colors: Record<string, string> = {
    green: "border-green-200 bg-green-50 dark:bg-green-900 dark:border-green-800 dark:text-green-100 text-green-900",
    yellow: "border-yellow-200 bg-yellow-50 dark:bg-yellow-900 dark:border-yellow-800 dark:text-yellow-100 text-yellow-900",
    blue: "border-blue-200 bg-blue-50 dark:bg-blue-900 dark:border-blue-800 dark:text-blue-100 text-blue-900",
    purple: "border-purple-200 bg-purple-50 dark:bg-purple-900 dark:border-purple-800 dark:text-purple-100 text-purple-900",
  };

  const base =
    "p-4 rounded-xl border bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800";

  return (
    <div className={`${base} ${accent ? colors[accent] : ""}`}>
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

// Modal component
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

// Report Output component
function ReportOutput({ result }: { result: CompareResult }) {
  const matchedFields = result.fields.filter(f => f.status === 'matched');
  const unresolvedFields = result.fields.filter(f => f.status === 'unresolved');
  const extraFields = result.fields.filter(f => f.status === 'extra');
  const missingFields = result.fields.filter(f => f.status === 'missing');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Download JSON report
  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
  a.download = "comparison-latest.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download PDF report
  const handleDownloadPdf = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('http://localhost:3200/render', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate PDF: ${response.statusText}`);
      }

      // Create a blob from the response and download it
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comparison-report.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Download Buttons */}
      <div className="flex justify-end mb-6 gap-3">
        <button
          className="px-5 py-2 rounded bg-blue-500 text-white font-medium hover:bg-blue-700 transition"
          onClick={handleDownloadJson}
        >
          Download JSON Report
        </button>
        <button
          className="px-5 py-2 rounded bg-red-500 text-white font-medium hover:bg-red-700 transition"
          onClick={handleDownloadPdf}
          disabled={loading}
        >
          {loading ? 'Generating PDF...' : 'Download PDF Report'}
        </button>
      </div>
      
      {error && <div className="text-red-600 text-lg mb-4">{error}</div>}

      {/* Summary Information */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">API Name</div>
          <div className="text-lg font-semibold">{result.api_name}</div>
        </div>
        <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">Validation Date</div>
          <div className="text-lg font-semibold">{new Date(result.validation_date).toLocaleString()}</div>
        </div>
        <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Fields Compared</div>
          <div className="text-lg font-semibold">{result.total_fields_compared}</div>
        </div>
        <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
          <div className="text-sm text-gray-600 dark:text-gray-400">Accuracy Score</div>
          <div className="text-lg font-semibold">{result.accuracy_score}%</div>
        </div>
      </div>

      {/* Summary Recommendation */}
      {result.summary_recommendation && (
        <div className="p-4 border rounded bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-800 mb-6">
          <h3 className="text-lg font-semibold mb-2">Summary Recommendation</h3>
          <p>{result.summary_recommendation}</p>
        </div>
      )}

      {/* Results Sections */}
      {matchedFields.length > 0 && (
        <FieldAnalysisSection title={`Matched Fields (${matchedFields.length})`} fields={matchedFields} status="matched" />
      )}

      {unresolvedFields.length > 0 && (
        <FieldAnalysisSection title={`Unresolved Fields (${unresolvedFields.length})`} fields={unresolvedFields} status="unresolved" />
      )}

      {extraFields.length > 0 && (
        <FieldAnalysisSection title={`Extra Fields (${extraFields.length})`} fields={extraFields} status="extra" />
      )}

      {missingFields.length > 0 && (
        <FieldAnalysisSection title={`Missing Fields (${missingFields.length})`} fields={missingFields} status="missing" />
      )}
    </>
  );
}

// Field Analysis Section for modal
function FieldAnalysisSection({ title, fields, status }: { 
  title: string; 
  fields: FieldAnalysis[]; 
  status: FieldAnalysis['status'];
}) {
  const statusColors = {
    matched: "bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800",
    unresolved: "bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-800",
    extra: "bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800",
    missing: "bg-purple-50 dark:bg-purple-900 border-purple-200 dark:border-purple-800",
  };

  return (
    <div className="border rounded bg-white dark:bg-gray-900 shadow-sm p-4 mb-6">
      <h2 className="text-2xl font-semibold mb-4">{title}</h2>
      <div className="space-y-3">
        {fields.map((field, idx) => (
          <div key={idx} className={`p-4 border rounded ${statusColors[status]}`}>
            <div className="text-lg font-medium mb-2">{field.field_name}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div><span className="font-semibold">Status:</span> {field.status}</div>
              <div><span className="font-semibold">Expected Type:</span> {field.expected_type}</div>
              <div><span className="font-semibold">Actual Type:</span> {field.actual_type}</div>
              <div><span className="font-semibold">Confidence:</span> {field.confidence}</div>
            </div>
            {field.issue && (
              <div className="mt-2">
                <span className="font-semibold">Issue:</span> {field.issue}
              </div>
            )}
            {field.suggestion && (
              <div className="mt-2">
                <span className="font-semibold">Suggestion:</span> {field.suggestion}
              </div>
            )}
            {field.rationale && (
              <div className="mt-2">
                <span className="font-semibold">Rationale:</span> {field.rationale}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper: Pie Chart
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = Math.max(segments.reduce((sum, s) => sum + s.value, 0), 1); // prevent division by zero

  // Helper to describe an SVG arc
  const describeArc = (
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ) => {
    const start = {
      x: cx + r * Math.cos((Math.PI / 180) * startAngle),
      y: cy + r * Math.sin((Math.PI / 180) * startAngle),
    };
    const end = {
      x: cx + r * Math.cos((Math.PI / 180) * endAngle),
      y: cy + r * Math.sin((Math.PI / 180) * endAngle),
    };
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${cx} ${cy}`,
      `L ${start.x} ${start.y}`,
      `A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  };

  const cx = 70;
  const cy = 70;
  const r = 54;

  let currentAngle = 0;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 140 140" width="140" height="140" className="shrink-0">
        {segments.map((s, i) => {
          const angle = (s.value / total) * 360;
          const path = describeArc(cx, cy, r, currentAngle, currentAngle + angle);
          currentAngle += angle;
          return <path key={i} d={path} fill={s.color} stroke="#fff" strokeWidth={2} />;
        })}
      </svg>
      <ul className="space-y-2">
        {segments.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
            <span className="min-w-[6rem]">{s.label}</span>
            <span className="tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// DropZone component for file upload and paste
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

  const matchesAccept = (file: File) => {
    const name = file.name.toLowerCase();
    const type = file.type;
    return accept.some((a) => (a.startsWith(".") ? name.endsWith(a) : type === a));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!matchesAccept(file)) {
      setError(`Unsupported file type: ${file.type || file.name}`);
      return;
    }
    setError(null);
    onFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
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
  };

  const handlePick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.onchange = () => handleFiles(input.files);
    input.click();
  };

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
        className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl text-center cursor-pointer select-none ${
          dragOver
            ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30"
            : "border-gray-300 dark:border-gray-700"
        } hover:border-blue-500`}
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
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>
    </div>
  );
}