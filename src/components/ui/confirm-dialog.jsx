"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Info, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DialogContext = createContext(null);

const TONE_STYLES = {
  danger: {
    Icon: Trash2,
    chip: "bg-red-50 text-red-600",
    action: "border border-red-700/10 bg-red-600 text-white hover:bg-red-700",
  },
  warning: {
    Icon: CircleAlert,
    chip: "bg-amber-50 text-amber-700",
    action: "border border-[#2f554a]/10 bg-[#4F726B] text-white hover:bg-[#3d625a]",
  },
  info: {
    Icon: Info,
    chip: "bg-[#e8f4ee] text-[#356b5d]",
    action: "border border-[#2f554a]/10 bg-[#4F726B] text-white hover:bg-[#3d625a]",
  },
};

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function promptFields(request) {
  if (Array.isArray(request.fields) && request.fields.length) return request.fields;
  return [
    {
      name: "value",
      label: request.label || "",
      defaultValue: request.defaultValue ?? "",
      placeholder: request.placeholder || "",
      helper: request.helper || "",
      multiline: Boolean(request.multiline),
      inputType: request.inputType || "text",
    },
  ];
}

function DialogSurface({ request, onSettle }) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const actionRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const isPrompt = request.kind === "prompt";
  const isAlert = request.kind === "alert";
  const fields = useMemo(() => (isPrompt ? promptFields(request) : []), [isPrompt, request]);
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.name, String(field.defaultValue ?? "")]))
  );
  const [error, setError] = useState("");

  const tone = TONE_STYLES[request.tone] || TONE_STYLES.info;
  const Icon = tone.Icon;
  const cancelValue = isPrompt ? null : false;

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const firstInput = panel?.querySelector("[data-dialog-input]");
    const initialFocus = isAlert ? actionRef.current : isPrompt ? firstInput : cancelRef.current;
    initialFocus?.focus?.();
    if (firstInput instanceof HTMLInputElement) firstInput.select();

    return () => {
      document.body.style.overflow = previousOverflow;
      const restore = restoreFocusRef.current;
      if (restore && typeof restore.focus === "function" && document.contains(restore)) restore.focus();
    };
  }, [isAlert, isPrompt]);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onSettle(cancelValue);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit() {
    if (!isPrompt) {
      onSettle(true);
      return;
    }
    const value =
      Array.isArray(request.fields) && request.fields.length
        ? Object.fromEntries(fields.map((field) => [field.name, String(values[field.name] ?? "")]))
        : String(values.value ?? "");
    const message = typeof request.validate === "function" ? request.validate(value) : "";
    if (message) {
      setError(message);
      return;
    }
    onSettle(value);
  }

  return (
    <div
      className="ply-dialog-overlay fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-[#0b241c]/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSettle(cancelValue);
      }}
    >
      <form
        ref={panelRef}
        role={isAlert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={request.description ? descriptionId : undefined}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={handleKeyDown}
        className="ply-dialog-panel w-full max-w-[460px] overflow-hidden rounded-2xl border border-[#d9e6e0] bg-white text-[#17372e] shadow-[0_30px_80px_-24px_rgba(11,36,28,0.55)]"
      >
        <div className="flex items-start gap-3.5 px-5 pb-1 pt-5 sm:px-6 sm:pt-6">
          <span className={cn("mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full", tone.chip)}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="pr-7 text-base font-semibold leading-6 text-[#17372e] [overflow-wrap:anywhere]"
            >
              {request.title}
            </h2>
            {request.description ? (
              <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-[#55726a]">
                {request.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onSettle(cancelValue)}
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-2 text-[#7b918a] transition-colors hover:bg-[#eef4f1] hover:text-[#38564b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F726B] focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-5 pt-3 sm:px-6">
          {request.details?.length ? (
            <ul className="space-y-1.5 rounded-xl border border-[#e3ece7] bg-[#f7faf8] px-4 py-3 text-sm text-[#38564b]">
              {request.details.map((detail) => (
                <li key={detail} className="flex gap-2.5 [overflow-wrap:anywhere]">
                  <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#7d9a90]" />
                  <span className="leading-6">{detail}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {request.warning ? (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-6">{request.warning}</p>
            </div>
          ) : null}

          {isPrompt ? (
            <div className="mt-4 space-y-4">
              {fields.map((field, index) => (
                <div key={field.name}>
                  <label
                    htmlFor={`${titleId}-${field.name}`}
                    className="block text-sm font-medium text-[#2f4f45]"
                  >
                    {field.label}
                  </label>
                  {field.multiline ? (
                    <Textarea
                      id={`${titleId}-${field.name}`}
                      data-dialog-input={index === 0 ? "" : undefined}
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      className="mt-2 min-h-[84px] bg-white"
                    />
                  ) : (
                    <Input
                      id={`${titleId}-${field.name}`}
                      data-dialog-input={index === 0 ? "" : undefined}
                      type={field.inputType || "text"}
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      className="mt-2 h-11 bg-white"
                    />
                  )}
                  {field.helper ? (
                    <p className="mt-1.5 text-xs leading-5 text-[#7b918a]">{field.helper}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm font-medium text-red-600">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#eef3f0] bg-[#f9fbfa] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          {isAlert ? null : (
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              className="border-[#cfddd6] bg-white text-[#38564b]"
              onClick={() => onSettle(cancelValue)}
            >
              {request.cancelLabel || "Cancel"}
            </Button>
          )}
          <Button ref={actionRef} type="submit" className={tone.action}>
            {request.confirmLabel || (isAlert ? "OK" : isPrompt ? "Save" : "Confirm")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function DialogProvider({ children }) {
  const [active, setActive] = useState(null);
  const activeRef = useRef(null);
  const queueRef = useRef([]);
  const countRef = useRef(0);

  const startNext = useCallback(() => {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  const open = useCallback(
    (options) =>
      new Promise((resolve) => {
        countRef.current += 1;
        queueRef.current.push({
          ...(typeof options === "string" ? { title: options } : options || {}),
          id: countRef.current,
          resolve,
        });
        startNext();
      }),
    [startNext]
  );

  const settle = useCallback(
    (value) => {
      const current = activeRef.current;
      if (!current) return;
      activeRef.current = null;
      setActive(null);
      current.resolve(value);
      startNext();
    },
    [startNext]
  );

  const dialogs = useMemo(
    () => ({
      confirm: (options) =>
        open({ tone: "warning", confirmLabel: "Confirm", ...(typeof options === "string" ? { title: options } : options), kind: "confirm" }),
      alert: (options) =>
        open({ ...(typeof options === "string" ? { title: options } : options), kind: "alert" }),
      prompt: (options) =>
        open({
          tone: "info",
          confirmLabel: "Save",
          ...(typeof options === "string" ? { title: options } : options),
          kind: "prompt",
        }),
    }),
    [open]
  );

  return (
    <DialogContext.Provider value={dialogs}>
      {children}
      {active && typeof document !== "undefined"
        ? createPortal(<DialogSurface key={active.id} request={active} onSettle={settle} />, document.body)
        : null}
    </DialogContext.Provider>
  );
}

export function useDialogs() {
  const dialogs = useContext(DialogContext);
  if (!dialogs) {
    throw new Error("useDialogs must be used inside a DialogProvider.");
  }
  return dialogs;
}
