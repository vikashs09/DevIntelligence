import icon from "../assets/dev-intelligence-icon.png";

export default function Logo({ compact = false, className = "" }) {
  return (
    <div className={`brand ${compact ? "compact" : ""} ${className}`}>
      <img src={icon} alt="Dev Intelligence" />
      {!compact && (
        <span>
          Dev <b>Intelligence</b>
        </span>
      )}
    </div>
  );
}
