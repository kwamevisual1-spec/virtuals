"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Smartphone,
  User as UserIcon,
  Info,
  Hash,
  Camera,
  Send,
  LogOut,
  Loader2,
  X,
  FileImage,
  ArrowLeft,
  PartyPopper,
  Clock,
} from "lucide-react";
import { RECIPIENT } from "@/lib/plans";
import { CopyButton } from "@/components/CopyButton";

export type PaymentFlowConfig = {
  kind: "registration" | "plan";
  title: string;
  subtitle: string;
  amount: string;
  currency: string; // e.g. "GHS"
  subtitleExtra?: string; // e.g. "Starter Plan · 30 days"
  successTitle: string;
  successMessage: string;
  cancelHref?: string;
  // For plan: back link to plans
  backHref?: string;
  backLabel?: string;
  // extra fields for submission
  planCode?: string;
  planName?: string;
};

export function PaymentFlow({
  config,
  existingRef,
  userToken,
  signupToken,
}: {
  config: PaymentFlowConfig;
  existingRef?: string | null;
  existingScreenshotName?: string | null;
  userToken?: string;
  signupToken?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState(existingRef || "");
  const [file, setFile] = useState<{
    name: string;
    size: number;
    dataUrl: string;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
    const reader = new FileReader();
    reader.onload = () => {
      setFile({
        name: f.name,
        size: f.size,
        dataUrl: String(reader.result || ""),
      });
    };
    reader.readAsDataURL(f);
  }

  function resetFile() {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (!file) {
      setError("Please upload your payment screenshot.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentType: config.kind,
          userToken,
          signupToken,
          planCode: config.planCode,
          planName: config.planName,
          amount: config.amount,
          currency: config.currency,
          transactionReference: reference || null,
          screenshotName: file.name,
          screenshotData: file.dataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to submit. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);

      if (data.shouldSignOut) {
        // Registration payment: sign the user out and take them back to
        // the sign-in page (they can sign in once the admin approves).
        await fetch("/api/auth/logout", { method: "POST" });
        const msg =
          "Payment submitted! Your registration is now pending admin approval. " +
          "You can sign in once your account is approved (usually within a few hours).";
        // Short pause so the user sees the request went through, then navigate.
        setTimeout(() => {
          window.location.replace("/signin?msg=" + encodeURIComponent(msg));
        }, 700);
        return;
      }

      // Plan payment: stay on this page and show the success state.
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (config.kind === "registration") {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } else if (config.cancelHref) {
      router.push(config.cancelHref);
    }
  }

  return (
    <div className="space-y-6">
      {config.backHref && (
        <Link
          href={config.backHref}
          className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {config.backLabel || "Back"}
        </Link>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-between">
        <Step index={1} label="Select" state="done" />
        <div className="step-line active" />
        <Step index={2} label="Pay" state="active" />
        <div className="step-line" />
        <Step index={3} label="Submit" state="pending" />
      </div>

      {/* Amount due card */}
      <div className="rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
          Amount Due
        </div>
        <div className="mt-2 bg-gradient-to-r from-red-500 to-red-700 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
          {config.currency} {config.amount}
        </div>
        {config.subtitleExtra && (
          <div className="mt-1 text-sm text-slate-500">
            {config.subtitleExtra}
          </div>
        )}
      </div>

      {!submitted ? (
        <>
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
              <Smartphone className="h-6 w-6 text-red-600" />
              Send Payment To
            </h2>
            <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-br from-white to-red-50 p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-600">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="currentColor"
                  >
                    <path d="M12 2a7 7 0 00-7 7v2H3v11h18V11h-2V9a7 7 0 00-7-7zm-4 7a4 4 0 118 0v2H8V9z" />
                  </svg>
                </span>
                {RECIPIENT.network}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="select-all text-3xl font-black tracking-wider sm:text-5xl">
                  {RECIPIENT.number}
                </div>
                <CopyButton
                  value={RECIPIENT.number}
                  label="Copy number"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-slate-600">
                <UserIcon className="h-5 w-5 text-red-500" />
                <span className="text-lg font-medium">{RECIPIENT.name}</span>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow">
                Send: {config.currency} {config.amount}
              </div>
            </div>
          </div>

          <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Info className="mt-0.5 h-6 w-6 flex-shrink-0 text-blue-500" />
            <p className="text-[15px] leading-relaxed">
              After sending payment, upload your receipt screenshot below.
              You&apos;ll get access within a few hours after admin review.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-base font-semibold text-slate-800">
              Transaction Reference{" "}
              <span className="font-normal text-slate-500">
                (optional but recommended)
              </span>
            </label>
            <div className="input-shell">
              <Hash className="h-5 w-5 text-red-500" />
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. GH20240001234"
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              The reference/ID or name shown after completing payment
            </p>
          </div>

          <div>
            <label className="mb-2 block text-base font-semibold text-slate-800">
              Payment Screenshot <span className="text-red-600">*</span>
            </label>

            {!file ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="upload-zone w-full"
              >
                <Camera className="mx-auto h-14 w-14 text-red-500" />
                <div className="mt-3 text-xl font-bold text-slate-900 sm:text-2xl">
                  Tap to upload payment proof
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  JPG · PNG · max 5MB
                </div>
              </button>
            ) : (
              <div className="upload-zone selected relative">
                <button
                  type="button"
                  onClick={resetFile}
                  className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow hover:bg-white hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <Check className="mx-auto h-12 w-12 text-green-500" />
                <div className="mt-2 text-xl font-bold text-green-800">
                  Screenshot selected
                </div>
                <div className="mt-1 flex items-center justify-center gap-2 text-sm text-slate-700">
                  <FileImage className="h-4 w-4" />
                  {file.name}
                  {file.size > 0 && (
                    <span className="text-slate-500">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                  )}
                </div>
                {file.dataUrl && (
                  <div className="mx-auto mt-3 max-w-xs overflow-hidden rounded-xl border border-green-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.dataUrl}
                      alt="Payment proof"
                      className="h-auto w-full"
                    />
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                Submit for Review
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            className="w-full py-2 text-center text-base font-medium text-slate-500 transition hover:text-red-600"
          >
            {config.kind === "registration" ? (
              <>
                <LogOut className="mr-1 inline h-4 w-4" />
                Cancel and sign out
              </>
            ) : (
              "Cancel"
            )}
          </button>
        </>
      ) : (
        <div className="space-y-5">
          <div className="rounded-3xl border-2 border-green-200 bg-green-50 p-8 text-center">
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30">
              <PartyPopper className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              {config.successTitle}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-slate-600">
              {config.successMessage}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-green-700 shadow-sm">
              <Clock className="h-4 w-4" />
              Status: Pending review
            </div>
          </div>

          {config.kind === "plan" ? (
            <Link
              href={userToken ? `/plans?t=${userToken}` : "/plans"}
              className="btn-primary"
            >
              Back to Plans
            </Link>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
              Redirecting you to sign in...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step({
  index,
  label,
  state,
}: {
  index: number;
  label: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={
          "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold transition " +
          (state === "done"
            ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
            : state === "active"
              ? "bg-red-600 text-white shadow-lg shadow-red-500/30"
              : "bg-slate-100 text-slate-400 ring-2 ring-slate-200")
        }
      >
        {state === "done" ? (
          <Check className="h-6 w-6" strokeWidth={3} />
        ) : (
          index
        )}
      </div>
      <span
        className={
          "text-xs font-semibold uppercase tracking-wider " +
          (state === "pending" ? "text-slate-400" : "text-slate-800")
        }
      >
        {label}
      </span>
    </div>
  );
}
