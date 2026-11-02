"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Volume2,
  X,
} from "lucide-react";
import { screenGuides } from "../lib/screen-guides";
import { useDialogScrollLock } from "./use-dialog-scroll-lock";
export default function PageHelp({
  screen,
  onActiveChange,
}: {
  screen: string;
  onActiveChange?: (active: boolean) => void;
}) {
  const guide = screenGuides[screen] || screenGuides.Dashboard;
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [answer, setAnswer] = useState(-1),
    [voice, setVoice] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [targetAvailable, setTargetAvailable] = useState(false),
    [spotlight, setSpotlight] = useState<{
      selector: string;
      label: string;
    } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLElement>(null),
    title = useRef<HTMLHeadingElement>(null),
    active = useRef(onActiveChange);
  active.current = onActiveChange;
  const id = useId(),
    isCheck = step === guide.steps.length,
    current = guide.steps[step];
  useDialogScrollLock(open);
  function stop() {
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.cancel();
    setSpeaking(false);
  }
  function close() {
    stop();
    setOpen(false);
  }
  useEffect(() => {
    setVoice(
      "speechSynthesis" in window && "SpeechSynthesisUtterance" in window,
    );
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    active.current?.(open);
    return () => active.current?.(false);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement;
    title.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab") {
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),[href],input:not(:disabled),[tabindex="0"]',
          ) || [],
        );
        if (!controls.length) return;
        const first = controls[0],
          last = controls.at(-1)!;
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === title.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
      else trigger.current?.focus();
    };
  }, [open]);
  useEffect(() => {
    setAnswer(-1);
    if (open) {
      title.current?.focus();
      setTargetAvailable(
        !!current?.target && !!document.querySelector(current.target),
      );
    }
    stop();
  }, [step, open]);
  useEffect(() => {
    if (open || !spotlight) return;
    const timer = setTimeout(() => {
      const node = document.querySelector<HTMLElement>(spotlight.selector);
      if (!node) {
        setSpotlight(null);
        return;
      }
      node.classList.add("guide-highlight");
      node.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    }, 30);
    return () => {
      clearTimeout(timer);
      document
        .querySelectorAll(".guide-highlight")
        .forEach((n) => n.classList.remove("guide-highlight"));
    };
  }, [spotlight, open]);
  function read() {
    if (speaking) {
      stop();
      return;
    }
    const text = isCheck
      ? `${guide.check.question}. ${guide.check.options.join(". ")}`
      : `${current.title}. ${current.body}. ${current.example.join(". ")}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }
  return (
    <>
      <button
        ref={trigger}
        className="screen-help"
        aria-label={`Help for ${screen}`}
        title={`Guide to ${screen}`}
        onClick={() => {
          setSpotlight(null);
          setOpen(true);
        }}
      >
        <BookOpen size={18} />
        <span>Help</span>
      </button>
      {open &&
        createPortal(
          <div
            className="guide-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <section
              ref={dialog}
              className="guide-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={id}
            >
              <div className="guide-hero">
                <div className="guide-hero-top">
                  <span>
                    <Compass size={18} />
                    YOUR POCKET GUIDE
                  </span>
                  <button aria-label="Close screen guide" onClick={close}>
                    <X size={20} />
                  </button>
                </div>
                <h2 id={id} ref={title} tabIndex={-1}>
                  {screen === "Welcome" ? "Meet Budget Tracker" : screen}
                </h2>
                <p>{guide.intro}</p>
                <div className="guide-progress" aria-label="Tutorial steps">
                  {[...guide.steps, { title: "Quick check" }].map(
                    (item, index) => (
                      <button
                        key={index}
                        aria-label={`Step ${index + 1}: ${item.title}`}
                        aria-current={index === step ? "step" : undefined}
                        onClick={() => setStep(index)}
                      >
                        <span>
                          {index < step ? <Check size={12} /> : index + 1}
                        </span>
                        <i />
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="guide-content" aria-live="polite">
                {!isCheck ? (
                  <>
                    <span className="guide-step-label">
                      STEP {step + 1} OF {guide.steps.length}
                    </span>
                    <h3>{current.title}</h3>
                    <p>{current.body}</p>
                    <div className="guide-example">
                      {current.example.map((text, index) => (
                        <div key={text}>
                          <span>{index + 1}</span>
                          <b>{text}</b>
                        </div>
                      ))}
                    </div>
                    {current.target && targetAvailable && (
                      <button
                        className="guide-show"
                        onClick={() => {
                          setSpotlight({
                            selector: current.target!,
                            label: current.targetLabel || current.title,
                          });
                          close();
                        }}
                      >
                        Show me on this screen <ChevronRight size={16} />
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="guide-step-label">A QUICK CHECK</span>
                    <h3>{guide.check.question}</h3>
                    <div className="guide-answers">
                      {guide.check.options.map((option, index) => (
                        <button
                          key={option}
                          aria-pressed={answer === index}
                          className={
                            answer === index
                              ? index === guide.check.answer
                                ? "correct"
                                : "try-again"
                              : ""
                          }
                          onClick={() => setAnswer(index)}
                        >
                          {option}
                          {answer === index && index === guide.check.answer && (
                            <Check size={18} />
                          )}
                        </button>
                      ))}
                    </div>
                    {answer >= 0 && (
                      <p className="guide-feedback" role="status">
                        {answer === guide.check.answer
                          ? "Exactly. "
                          : "Try the other option. "}
                        {guide.check.why}
                      </p>
                    )}
                  </>
                )}
              </div>
              <div className="guide-footer">
                <div>
                  {voice && (
                    <button
                      className="guide-read"
                      aria-label={
                        speaking ? "Stop reading guide" : "Read guide aloud"
                      }
                      onClick={read}
                    >
                      <Volume2 size={16} />
                      {speaking ? "Stop" : "Read aloud"}
                    </button>
                  )}
                  <small>Tips only · no changes to your records</small>
                </div>
                <div className="row-actions">
                  <button
                    aria-label="Previous tutorial step"
                    disabled={step === 0}
                    onClick={() => setStep(step - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="primary"
                    onClick={() => (isCheck ? close() : setStep(step + 1))}
                  >
                    {isCheck ? "Got it" : "Next"}
                    {!isCheck && <ChevronRight size={16} />}
                  </button>
                </div>
              </div>
            </section>
          </div>,
          document.body,
        )}
      {!open &&
        spotlight &&
        createPortal(
          <div className="guide-nudge" role="status">
            <div>
              <Compass size={18} />
              <span>{spotlight.label}</span>
            </div>
            <button
              onClick={() => {
                setSpotlight(null);
                setOpen(true);
              }}
            >
              Continue guide
            </button>
            <button
              aria-label="Dismiss guide highlight"
              onClick={() => setSpotlight(null)}
            >
              <X size={16} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
