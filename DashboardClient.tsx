"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Zap,
  Lock,
  Gem,
  RefreshCw,
  Home,
  Plane,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  TrendingUp,
  Users,
  Camera,
  X,
  FileImage,
  Loader2,
  ScanLine,
  RotateCcw,
  BarChart3,
  Handshake,
} from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { dailyLimitForPlan, countMatchesFromText, type ExtractedMatch } from "@/lib/predictions";
import { BottomNav } from "@/components/BottomNav";

type Match = {
  id: number;
  league: string;
  date: string;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  pick: string;
  pickSide: "home" | "away";
  winRate: number;
};

type FeedItem = Match & {
  key: string;
  userName: string;
  userInitial: string;
  createdAt: number;
  isNew: boolean;
};

type Props = {
  user: SessionUser;
  matches: Match[];
  planStatus: "none" | "pending" | "active";
  pendingPlanName: string | null;
  activePlanName: string | null;
  hasActivePlan: boolean;
  userToken: string;
  previewNote?: string;
  adminPreview?: boolean;
};

const EXTRA_MATCHES: Match[] = [
  { id: 101, league: "VIRTUAL PREMIER LEAGUE", date: "31 Aug · 20:45", homeCode: "ARS", homeName: "Arsenal", awayCode: "MCI", awayName: "Man City", pick: "Arsenal", pickSide: "home", winRate: 94 },
  { id: 102, league: "VIRTUAL BUNDESLIGA", date: "31 Aug · 20:45", homeCode: "DOR", homeName: "Dortmund", awayCode: "LEI", awayName: "Leipzig", pick: "Dortmund", pickSide: "home", winRate: 88 },
  { id: 103, league: "VIRTUAL EREDIVISIE", date: "31 Aug · 20:45", homeCode: "AJX", homeName: "Ajax", awayCode: "PSV", awayName: "PSV Eindhoven", pick: "Ajax", pickSide: "home", winRate: 90 },
  { id: 104, league: "VIRTUAL CHAMPIONS LEAGUE", date: "31 Aug · 20:45", homeCode: "LIV", homeName: "Liverpool", awayCode: "MIL", awayName: "AC Milan", pick: "Liverpool", pickSide: "home", winRate: 95 },
  { id: 105, league: "VIRTUAL SERIE A", date: "31 Aug · 20:45", homeCode: "JUV", homeName: "Juventus", awayCode: "ROM", awayName: "AS Roma", pick: "Juventus", pickSide: "home", winRate: 87 },
  { id: 106, league: "VIRTUAL LIGUE 1", date: "31 Aug · 20:45", homeCode: "PSG", homeName: "PSG", awayCode: "MON", awayName: "Monaco", pick: "PSG", pickSide: "home", winRate: 93 },
  { id: 107, league: "VIRTUAL LA LIGA", date: "31 Aug · 20:45", homeCode: "ATM", homeName: "Atletico", awayCode: "SEV", awayName: "Sevilla", pick: "Atletico", pickSide: "home", winRate: 86 },
  { id: 108, league: "VIRTUAL PREMIER LEAGUE", date: "31 Aug · 20:45", homeCode: "NEW", homeName: "Newcastle", awayCode: "TOT", awayName: "Tottenham", pick: "Newcastle", pickSide: "home", winRate: 91 },
];

const USER_POOL = [
  "Kwame A.", "Ama S.", "Yaw O.", "Efua M.", "Kofi B.", "Akosua D.",
  "Emmanuel T.", "Grace N.", "Bright K.", "Selasi A.", "Nana Y.", "Esi A.",
  "Kojo M.", "Abena F.", "Daniel O.", "Maame P.", "Kwabena S.", "Araba T.",
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

let feedCounter = 0;
function makeFeedItems(pool: Match[], count: number, minutesAgo: number[]): FeedItem[] {
  const now = Date.now();
  return pickRandom(pool, count).map((m, i) => {
    const userName = USER_POOL[Math.floor(Math.random() * USER_POOL.length)];
    return {
      ...m,
      key: `f-${++feedCounter}-${m.id}`,
      userName,
      userInitial: userName.charAt(0).toUpperCase(),
      createdAt: now - minutesAgo[i] * 60_000,
      isNew: minutesAgo[i] === 0,
      winRate: Math.min(98, Math.max(84, m.winRate + Math.round((Math.random() - 0.5) * 4))),
    };
  });
}

function timeAgo(createdAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hr ago" : `${hrs} hrs ago`;
}

function plansHref(token?: string) {
  return token ? `/plans?t=${token}` : "/plans";
}

type AnalysisModel = {
  home: number; draw: number; away: number;
  predicted: "1" | "X" | "2";
  confidence: number;
  dataQuality: string;
  analysis: string;
  factors: string[];
  implied: { home: number; draw: number; away: number } | null;
  overround: number | null;
  homeOdds: number | null; drawOdds: number | null; awayOdds: number | null;
};

type PredictionOut = {
  key: string;
  league: string;
  datetime: string | null;
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  analysis: AnalysisModel;
  userName: string;
  userInitial: string;
  createdAt: number;
  isNew: boolean;
};

/** Prediction Results card with Home / Draw / Away probabilities. */
function ResultCard({ item }: { item: PredictionOut }) {
  const a = item.analysis;
  const pickLabel = a.predicted === "1" ? "1 · Home Win" : a.predicted === "X" ? "X · Draw" : "2 · Away Win";
  const PickIcon = a.predicted === "X" ? Handshake : a.predicted === "1" ? Shield : Plane;
  const bars = [
    { label: "1", value: a.home, color: "from-red-500 to-red-600", text: "text-red-600" },
    { label: "X", value: a.draw, color: "from-slate-400 to-slate-500", text: "text-slate-500" },
    { label: "2", value: a.away, color: "from-red-700 to-red-900", text: "text-red-800" },
  ] as const;
  return (
    <article className="feed-in relative overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-red-500 to-red-700" />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {item.league}{item.datetime ? ` · ${item.datetime}` : ""}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5 text-lg font-extrabold tracking-tight text-slate-900">
              <span>{item.homeCode}</span>
              <span className="text-xs font-semibold text-slate-400">vs</span>
              <span>{item.awayCode}</span>
            </div>
            <div className="truncate text-xs text-slate-500">{item.homeName} vs {item.awayName}</div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
              <PickIcon className="h-3.5 w-3.5 text-red-600" />
              {pickLabel}
            </span>
            <div className="mt-1 text-[11px] font-semibold text-slate-500">
              Confidence {a.confidence}% · {a.dataQuality === "odds-verified" ? "Odds verified" : a.dataQuality === "baseline-only" ? "Baseline only" : "Low quality"}
            </div>
          </div>
        </div>

        {/* 1X2 probability bars */}
        <div className="mt-4 space-y-2">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className={`w-4 text-xs font-black ${b.text}`}>{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full bg-gradient-to-r ${b.color}`} style={{ width: `${b.value}%` }} />
              </div>
              <span className="w-11 text-right text-xs font-extrabold text-slate-800">{b.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>

        {/* Odds + analysis */}
        {a.implied && (
          <p className="mt-3 text-[11px] text-slate-500">
            Odds {a.homeOdds} / {a.drawOdds} / {a.awayOdds} → market {a.implied.home}% / {a.implied.draw}% / {a.implied.away}% (margin {a.overround}% removed)
          </p>
        )}
        <p className="mt-1.5 text-xs italic leading-relaxed text-slate-500">{a.analysis}</p>
      </div>
    </article>
  );
}

function SmartPredictor({
  unlocked,
  pending,
  pendingPlanName,
  userToken,
  pool,
  dailyLimit,
  usedToday,
  onUsageChange,
  adminPreview = false,
}: {
  unlocked: boolean;
  pending: boolean;
  pendingPlanName: string | null;
  userToken?: string;
  pool: Match[];
  dailyLimit: number | null;
  usedToday: number;
  onUsageChange: (n: number) => void;
  adminPreview?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "selected" | "scanning" | "manual" | "results">("idle");
  const [file, setFile] = useState<{ name: string; size: number; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanPct, setScanPct] = useState(0);
  const [scanMsg, setScanMsg] = useState("Reading screenshot");
  const [detected, setDetected] = useState(0);
  const [results, setResults] = useState<PredictionOut[]>([]);
  const [notice, setNotice] = useState<{ kind: "warn" | "error"; text: string; retry?: boolean; code?: string } | null>(null);

  const remaining = dailyLimit === null ? null : Math.max(0, dailyLimit - usedToday);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(jpe?g|png)$/i.test(f.name)) {
      setError("Only JPG and PNG images are allowed.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be less than 5MB.");
      return;
    }
    setError(null);
    setNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFile({ name: f.name, size: f.size, dataUrl: String(reader.result || "") });
      setPhase("selected");
    };
    reader.readAsDataURL(f);
  }

  function resetAll() {
    setFile(null);
    setError(null);
    setNotice(null);
    setResults([]);
    setDetected(0);
    setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  const STAGES = [
    "Uploading Screenshot",
    "Scanning Image",
    "Detecting Match Rows",
    "Extracting Team Names",
    "Extracting Betting Odds",
    "Verifying Information",
    "Analyzing Football Statistics",
    "Generating Predictions",
    "Results Ready",
  ];
  const [stageIdx, setStageIdx] = useState(0);

  /** Upload the image to the server pipeline and render verified predictions. */
  async function scan() {
    if (!file) {
      setError("Please upload a match screenshot first.");
      return;
    }
    setError(null);
    setNotice(null);
    setResults([]);
    setPhase("scanning");
    // The server performs OCR, extraction and verification as one request.
    // Do not advance the stages on a timer: only the real response can
    // complete them, otherwise "Generating Predictions" appears too early.
    setStageIdx(1);
    setScanPct(15);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
      const res = await fetch("/api/predictions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userToken,
          adminPreview,
          screenshotName: file.name,
          image: file.dataUrl,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setScanPct(90);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setNotice({
          kind: "error",
          text: data.error || "We couldn't process that screenshot. Please try again.",
          retry: data.retry !== false,
          code: data.code,
        });
        setPhase("selected");
        setResults([]);
        return;
      }

      setStageIdx(STAGES.length - 1);
      setScanPct(100);
      const list: PredictionOut[] = (data.matches || []).map((m: any, i: number) => ({
        key: `r-${Date.now()}-${i}`,
        league: m.league || "VIRTUAL LEAGUE",
        datetime: m.datetime || null,
        homeCode: m.homeCode,
        homeName: m.homeName,
        awayCode: m.awayCode,
        awayName: m.awayName,
        analysis: m.analysis,
        userName: "You",
        userInitial: "Y",
        createdAt: Date.now(),
        isNew: true,
      }));
      if (!data.preview && typeof data.usedToday === "number") onUsageChange(data.usedToday);
      if (data.warning) {
        setNotice({ kind: "warn", text: String(data.warning) });
      }
      setResults(list);
      setDetected(list.length);
      setPhase("results");
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      setNotice({
        kind: "error",
        text: aborted
          ? "Scanning took too long. Try a smaller, sharper screenshot."
          : "Network error while analysing. Check your connection and try again.",
        retry: true,
      });
      setPhase("selected");
      setResults([]);
    }
  }

  if (!unlocked) {
    return (
      <section className="relative overflow-hidden rounded-3xl border-2 border-dashed border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 ring-8 ring-red-50/60">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
          Unlock Smart Predictions
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          {pending
            ? `Your ${pendingPlanName || "selected"} plan payment is being reviewed by admin. Smart predictions unlock once approved.`
            : "Activate a plan to start analysing virtual match screenshots with our smart engine."}
        </p>

        {pending ? (
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-200">
            <Clock className="h-4 w-4" />
            Awaiting admin approval
          </div>
        ) : (
          <Link href={plansHref(userToken)} className="btn-primary mx-auto mt-5 max-w-xs">
            <Gem className="h-5 w-5" />
            View Plans
          </Link>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
              <ScanLine className="h-5 w-5 text-red-600" />
              Smart Match Predictor
            </h2>
          </div>
          {adminPreview && (
            <span className="flex-shrink-0 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Admin test · unlimited
            </span>
          )}
        </div>
        {adminPreview && (
          <p className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs text-violet-800">
            Test screenshots without buying a plan. Results are not saved and do not use customer prediction credits.
          </p>
        )}

        {phase === "idle" && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="upload-zone mt-4 w-full !p-6"
          >
            <Camera className="mx-auto h-10 w-10 text-red-500" />
            <div className="mt-2 text-base font-bold text-slate-900">
              Tap to upload match screenshot
            </div>
            <div className="text-xs text-slate-500">JPG · PNG · max 5MB</div>
          </button>
        )}

        {(phase === "selected" || phase === "results") && file && (
          <div className="mt-4 space-y-3">
            <div className="upload-zone selected relative !p-3">
              <button
                type="button"
                onClick={resetAll}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow hover:text-red-600"
                aria-label="Remove screenshot"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              {phase === "results" ? (
                <div className="flex items-center justify-center gap-2 py-1 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  {detected} match{detected === 1 ? "" : "es"} predicted!
                </div>
              ) : (
                <>
                  <div className="mx-auto max-w-[220px] overflow-hidden rounded-lg border border-green-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.dataUrl} alt="Match screenshot" className="h-auto w-full" />
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600">
                    <FileImage className="h-3.5 w-3.5 text-green-600" />
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <span className="text-slate-400">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                </>
              )}
            </div>

            {phase === "selected" ? (
              <button type="button" onClick={scan} className="btn-primary !h-12 !text-sm">
                <Zap className="h-4 w-4 fill-white" />
                Analyse &amp; Predict
              </button>
            ) : (
              <button
                type="button"
                onClick={resetAll}
                className="btn-outline !h-11 !text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                Upload New Screenshot
              </button>
            )}
          </div>
        )}

        {phase === "scanning" && (
          <div className="mt-4 rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-5">
            <div className="flex items-center gap-3 text-sm font-bold text-red-700">
              <Loader2 className="h-5 w-5 animate-spin" />
              {STAGES[stageIdx]}
              <span className="ml-auto text-xs text-red-500">{scanPct}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-700 transition-all duration-300"
                style={{ width: `${Math.max(8, scanPct)}%` }}
              />
            </div>
            <ol className="mt-3 space-y-1 text-xs text-slate-500">
              {STAGES.slice(0, -1).map((st, i) => (
                <li key={st} className="flex items-center gap-2">
                  {i < stageIdx ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : i === stageIdx ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                  )}
                  {st}
                </li>
              ))}
            </ol>
          </div>
        )}

        {notice && (
          <div
            className={
              "mt-4 flex flex-col gap-2 rounded-xl p-3.5 text-sm " +
              (notice.kind === "error"
                ? "border border-red-200 bg-red-50 text-red-700"
                : "border border-amber-200 bg-amber-50 text-amber-800")
            }
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{notice.text}</span>
            </div>
            <div className="pl-6">
              <Link
                href={plansHref(userToken)}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700"
              >
                <Gem className="h-3.5 w-3.5" />
                Upgrade Plan
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={handleFile}
        />
      </section>

      {/* Usage pill */}
      {(dailyLimit !== null || adminPreview) && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
            <Zap className="h-3.5 w-3.5 fill-red-600 text-red-600" />
            {adminPreview ? (
              <span>Admin test mode · no plan purchase needed</span>
            ) : (
              <span><strong className="text-slate-900">{usedToday}</strong> / {dailyLimit} predictions used</span>
            )}
          </div>
        </div>
      )}

      {/* Prediction Results — sits right ABOVE Earlier Selections */}
      {phase === "results" && results.length > 0 && (
        <section className="feed-in">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                Prediction Results
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!adminPreview && dailyLimit !== null && (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-100">
                  {usedToday} / {dailyLimit} predictions used today
                </span>
              )}
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                {results.length} match{results.length === 1 ? "" : "es"}
              </span>
            </div>
          </div>
          <div className="space-y-3">
            {results.map((r) => (
              <ResultCard key={r.key} item={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FeedCard({ item, now }: { item: FeedItem; now: number }) {
  const PickIcon = item.pickSide === "home" ? Shield : Plane;
  return (
    <article className="feed-in relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-red-500 to-red-700" />
      <div className="p-5 pl-6">
        {/* header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {item.league}
          </span>
          <span className="flex items-center gap-2 text-xs font-medium text-slate-400">
            {item.isNew && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-900">
                New
              </span>
            )}
            {item.date}
          </span>
        </div>

        {/* teams */}
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-center">
            <div className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {item.homeCode}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">{item.homeName}</div>
          </div>
          <div className="text-center">
            <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              VS
            </span>
          </div>
          <div className="text-center">
            <div className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              {item.awayCode}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">{item.awayName}</div>
          </div>
        </div>

        {/* smart pick */}
        <div className="mt-4 rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white shadow-md shadow-red-500/25">
                <PickIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">
                  Smart Pick
                </div>
                <div className="text-lg font-extrabold leading-tight text-slate-900 sm:text-xl">
                  {item.pick}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Win Rate
              </div>
              <div className="text-2xl font-extrabold tracking-tight text-emerald-500">
                {item.winRate}%
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
              style={{ width: `${item.winRate}%` }}
            />
          </div>
        </div>

        {/* picked by */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-[11px] font-bold text-white">
              {item.userInitial}
            </span>
            <span className="text-sm text-slate-600">
              Picked by <span className="font-semibold text-slate-800">{item.userName}</span>
            </span>
          </div>
          <span className="text-xs font-medium text-slate-400">
            {timeAgo(item.createdAt, now)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function DashboardClient({
  user,
  matches,
  planStatus,
  pendingPlanName,
  activePlanName,
  hasActivePlan,
  userToken,
  previewNote,
  adminPreview = false,
}: Props) {
  // Prefer a fresh token from the browser session (works even when cookies
  // are blocked); fall back to the token the page was opened with.
  const [token, setToken] = useState(userToken);
  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem("vp_session") ||
        sessionStorage.getItem("vp_admin_session");
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.access_token) setToken(s.access_token);
      }
    } catch {
      // storage unavailable; keep the link token
    }
  }, []);

  const pool = useMemo(() => [...matches, ...EXTRA_MATCHES], [matches]);
  const [feed, setFeed] = useState<FeedItem[]>(() =>
    makeFeedItems(pool, 4, [3, 9, 17, 24])
  );
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(30);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [todayCount, setTodayCount] = useState(1284);
  const [online, setOnline] = useState(312);

  function doRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      setFeed((prev) => {
        const fresh = makeFeedItems(pool, 3, [0, 0, 0]);
        const merged = [...fresh, ...prev.map((f) => ({ ...f, isNew: false }))];
        return merged.slice(0, 8);
      });
      setTodayCount((c) => c + 3 + Math.floor(Math.random() * 4));
      setOnline((c) => Math.max(240, c + Math.round((Math.random() - 0.5) * 18)));
      countdownRef.current = 30;
      setCountdown(30);
      setNow(Date.now());
      setRefreshing(false);
    }, 700);
  }

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        // auto-refresh: new predictions from platform users arrive
        countdownRef.current = 30;
        doRefresh();
      }
      setCountdown(countdownRef.current);
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  const greetingName = user.fullName.split(" ")[0];

  // Plan rules for the predictor
  const [usedToday, setUsedToday] = useState(0);
  const dailyLimit = useMemo(
    () => (user.activePlan ? dailyLimitForPlan(user.activePlan) : null),
    [user.activePlan]
  );

  // Load today's usage from the server (falls back to local storage).
  useEffect(() => {
    if (!hasActivePlan || adminPreview) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/predictions?t=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (alive && res.ok && typeof data.usedToday === "number") {
          setUsedToday(data.usedToday);
          return;
        }
      } catch {
        // offline
      }
      try {
        const { readLocalUsage, todayKey } = await import("@/lib/predictions");
        const usage = readLocalUsage();
        if (alive) setUsedToday(usage[todayKey()] || 0);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasActivePlan, token, adminPreview]);
  const avgRate = useMemo(
    () => Math.round(feed.reduce((a, f) => a + f.winRate, 0) / Math.max(1, feed.length)),
    [feed]
  );

  return (
    <main className="relative bg-gradient-to-b from-white via-white to-red-50/40 pb-28">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {previewNote && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
            <span>{previewNote}</span>
            <Link href={userToken ? `/admin?t=${userToken}` : "/admin"} className="rounded-full bg-amber-600 px-3 py-1 text-xs font-bold text-white">
              Back to Admin
            </Link>
          </div>
        )}
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 text-white shadow-xl sm:p-8">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, #dc2626 0%, transparent 70%)" }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.25em] text-red-400">
              <Activity className="h-4 w-4" />
              Live prediction feed
            </div>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Welcome back, {greetingName}
            </h1>
            <div className="mt-3">
              {hasActivePlan ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {activePlanName} Plan Active
                </span>
              ) : planStatus === "pending" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-300/30">
                  <Clock className="h-3.5 w-3.5" />
                  {pendingPlanName} Plan Pending
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/20">
                  <AlertCircle className="h-3.5 w-3.5" />
                  No active plan
                </span>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/5 ring-1 ring-white/10">
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <TrendingUp className="h-3.5 w-3.5 text-red-400" />
                  Today
                </div>
                <div className="mt-1 text-xl font-extrabold sm:text-2xl">{todayCount.toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">predictions</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Win rate
                </div>
                <div className="mt-1 text-xl font-extrabold text-emerald-400 sm:text-2xl">{avgRate}%</div>
                <div className="text-[10px] text-slate-500">average</div>
              </div>
              <div className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Users className="h-3.5 w-3.5 text-red-400" />
                  Online
                </div>
                <div className="mt-1 text-xl font-extrabold sm:text-2xl">{online}</div>
                <div className="text-[10px] text-slate-500">members</div>
              </div>
            </div>
          </div>
        </section>

        {/* Smart Predictor */}
        <div className="mb-10 mt-8">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="h-5 w-5 fill-red-600 text-red-600" />
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
              Smart Match Predictor
            </h2>
          </div>
          <SmartPredictor
            unlocked={hasActivePlan}
            pending={planStatus === "pending"}
            pendingPlanName={pendingPlanName}
            userToken={token}
            pool={pool}
            dailyLimit={dailyLimit}
            adminPreview={adminPreview}
            usedToday={usedToday}
            onUsageChange={setUsedToday}
          />
        </div>

        {/* Earlier Predictions — live feed */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
              </span>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                Earlier Predictions
              </h2>
              <span className="hidden rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-red-600 ring-1 ring-red-100 sm:inline">
                Live
              </span>
            </div>
            <button
              onClick={doRefresh}
              disabled={refreshing}
              className={
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold transition " +
                (refreshing
                  ? "bg-slate-100 text-slate-400"
                  : "bg-red-600 text-white shadow-md shadow-red-500/25 hover:bg-red-700")
              }
            >
              <RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} />
              {refreshing
                ? "Refreshing"
                : `${String(Math.floor(countdown / 60)).padStart(1, "0")}:${String(countdown % 60).padStart(2, "0")}`}
            </button>
          </div>

          <div className="space-y-4">
            {feed.map((item) => (
              <FeedCard key={item.key} item={item} now={now} />
            ))}
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            New predictions from platform members arrive automatically every 30 seconds.
          </p>
        </section>
      </div>
      <BottomNav token={token} active="home" />
    </main>
  );
}
