import React from "react";

/** Prevent a failing feature view from crashing the entire workspace. */
export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Feature view failed", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="page" role="alert">
        <div className="panel feature-error">
          <h2>We couldn't display this section</h2>
          <p>{this.state.error?.message || "An unexpected display error occurred."}</p>
          <div className="feature-error-actions">
            <button className="primary" onClick={() => this.setState({ error: null })}>Try again</button>
            <button className="ghost-btn" onClick={this.props.onReset}>Return to dashboard</button>
          </div>
        </div>
      </section>
    );
  }
}
