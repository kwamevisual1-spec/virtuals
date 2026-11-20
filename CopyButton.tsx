"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Share2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";

const defaultStyle = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

export function CopyButton({
  value, label = "Copy link", iconOnly = false, shareTitle, disabled = false, disabledReason, className = defaultStyle,
}: {
  value: string | null | undefined;
  label?: string;
  iconOnly?: boolean;
  shareTitle?: string;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "copied" | "shared">("idle");
  const [manualValue, setManualValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const unavailable = disabled || !value;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function confirm(next: "copied" | "shared") {
    setStatus(next);
    timer.current = setTimeout(() => setStatus("idle"), 2000);
  }

  async function run() {
    if (unavailable || !value || status === "busy") return;
    if (timer.current) clearTimeout(timer.current);
    setStatus("busy");
    if (shareTitle && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, url: value });
        confirm("shared");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setStatus("idle");
          return;
        }
        // Unsupported or blocked share sheet: offer the same clipboard fallback.
      }
    }
    if (await copyText(value)) {
      confirm("copied");
    } else {
      setStatus("idle");
      setManualValue(value);
    }
  }

  const feedback = status === "copied" ? "Copied" : status === "shared" ? "Shared" : "";
  const Icon = feedback ? Check : shareTitle ? Share2 : Copy;

  return <>
    <button
      ref={trigger}
      type="button"
      onClick={run}
      disabled={unavailable || status === "busy"}
      title={unavailable ? disabledReason || label : feedback || label}
      aria-label={label}
      className={className}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!iconOnly && <span>{feedback || label}</span>}
    </button>
    <span role="status" className="sr-only">{feedback}</span>
    {manualValue !== null && <ManualCopyDialog value={manualValue} onDismiss={() => {
      setManualValue(null);
      requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    }} />}
  </>;
}

function ManualCopyDialog({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const modal = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const heading = useId();
  const description = useId();

  function selectText() {
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }

  useEffect(() => {
    const dialog = modal.current;
    if (!dialog || dialog.open) return;
    try { dialog.showModal(); }
    catch { dialog.setAttribute("open", ""); }
    field.current?.focus({ preventScroll: true });
    field.current?.select();
  }, []);

  return createPortal(
    <dialog
      ref={modal}
      aria-labelledby={heading}
      aria-describedby={description}
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      className="fixed inset-0 z-[80] m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/50"
    >
      <h2 id={heading} className="text-base font-bold">Copy manually</h2>
      <p id={description} className="mt-1.5 text-sm text-slate-600">
        Your browser blocked automatic copying. Press Ctrl+C or Command+C, or touch and hold the selected text and tap Copy.
      </p>
      <textarea
        ref={field}
        readOnly
        value={value}
        aria-label="Text to copy"
        className="mt-4 w-full resize-none break-all rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-base text-slate-900"
        rows={3}
      />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onDismiss} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">Close</button>
        <button type="button" onClick={selectText} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">Select text</button>
      </div>
    </dialog>, document.body,
  );
}
