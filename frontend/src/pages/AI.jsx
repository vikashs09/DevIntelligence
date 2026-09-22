import { useState } from "react";
import {
  BrainCircuit,
  Send,
  Sparkles,
} from "lucide-react";
import { api } from "../services/api";

const prompts = [
  "What are the current problems in my project?",
  "What should the team focus on today?",
  "Why is the project health score changing?",
  "Which tasks look risky or overdue?",
];

export default function AI() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(question = q) {
    const cleanQuestion = question.trim();

    if (!cleanQuestion || loading) {
      return;
    }

    setQ(cleanQuestion);
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const response = await api.post("/ai/chat", {
        question: cleanQuestion,
      });

      if (!response.data?.success) {
        throw new Error(
          response.data?.message || "AI request failed"
        );
      }

      setAnswer(
        response.data?.answer || "No answer received from AI."
      );
    } catch (err) {
      console.error("AI request error:", err);

      const message =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "AI request failed";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  }

  return (
    <div className="page ai-page">
      {/* =====================================================
          HERO
      ====================================================== */}
      <div className="ai-hero">
        <div className="ai-orb">
          <BrainCircuit size={38} />
        </div>

        <span className="eyebrow">
          PROJECT INTELLIGENCE
        </span>

        <h1>Ask your workspace.</h1>

        <p>
          Dev Intelligence reads your authorized project
          signals and turns them into evidence-based answers
          and actions.
        </p>
      </div>

      {/* =====================================================
          QUICK PROMPTS
      ====================================================== */}
      <div className="prompt-grid">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => ask(prompt)}
            disabled={loading}
          >
            <Sparkles size={15} />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* =====================================================
          AI PANEL
      ====================================================== */}
      <section className="ai-panel">
        <div className="ai-input">
          <input
            type="text"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask: What are the biggest risks right now?"
            disabled={loading}
          />

          <button
            type="button"
            className="primary"
            onClick={() => ask()}
            disabled={loading || !q.trim()}
          >
            {loading ? (
              "Thinking..."
            ) : (
              <>
                <Send size={17} />
                Ask AI
              </>
            )}
          </button>
        </div>

        {/* ===================================================
            ERROR
        ==================================================== */}
        {error && (
          <div className="error-box">
            <strong>AI Error</strong>
            <p>{error}</p>
          </div>
        )}

        {/* ===================================================
            LOADING
        ==================================================== */}
        {loading && (
          <div className="ai-answer">
            <div className="ai-answer-head">
              <div className="ai-mini">
                <BrainCircuit size={17} />
              </div>

              <b>Dev Intelligence</b>

              <span>
                Analyzing project data...
              </span>
            </div>

            <div className="answer-text">
              <p>
                Please wait while Dev Intelligence analyzes
                your authorized project information.
              </p>
            </div>
          </div>
        )}

        {/* ===================================================
            ANSWER
        ==================================================== */}
        {answer && !loading && (
          <div className="ai-answer">
            <div className="ai-answer-head">
              <div className="ai-mini">
                <BrainCircuit size={17} />
              </div>

              <b>Dev Intelligence</b>

              <span>
                Evidence-based response
              </span>
            </div>

            <div className="answer-text">
              {answer.split("\n").map((line, index) => (
                <p key={index}>
                  {line || "\u00A0"}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}