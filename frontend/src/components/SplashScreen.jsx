import { useEffect, useState } from "react";
import icon from "../assets/dev-intelligence-icon.png";
import logo from "../assets/dev-intelligence-logo.png";

export default function SplashScreen({ onDone, dark = true }) {
  const [stage, setStage] = useState("icon");

  useEffect(() => {
    const a = setTimeout(() => setStage("logo"), 950);
    const b = setTimeout(() => setStage("done"), 2250);
    const c = setTimeout(onDone, 2400);
    return () => [a, b, c].forEach(clearTimeout);
  }, [onDone]);

  if (stage === "done") return null;

  return (
    <div className={`splash ${dark ? "dark" : "light"}`}>
      <div className={`splash-icon ${stage === "logo" ? "exit" : ""}`}>
        <img src={icon} alt="" />
      </div>
      <div className={`splash-logo-wrap ${stage === "logo" ? "show" : ""}`}>
        <img className="splash-logo" src={logo} alt="Dev Intelligence" />
      </div>
      <div className="splash-line" />
    </div>
  );
}
