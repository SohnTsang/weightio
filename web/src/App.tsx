// web/src/App.tsx
import { useState } from "react";
import LandingPage from "./pages/LandingPage";
import Planner from "./pages/Planner";
import Results from "./pages/Results";
import type { GenerateRes } from "./types";

type Page = "landing" | "planner" | "results";

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("landing");
  const [plan, setPlan] = useState<GenerateRes | null>(null);

  const handleGetStarted = () => {
    setCurrentPage("planner");
  };

  const handlePlanGenerated = (generatedPlan: GenerateRes) => {
    setPlan(generatedPlan);
    setCurrentPage("results");
  };

  const handleBackToPlanner = () => {
    setCurrentPage("planner");
  };

  const handleBackToLanding = () => {
    setCurrentPage("landing");
    setPlan(null);
  };

  // Render current page
  if (currentPage === "landing") {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  if (currentPage === "planner") {
    return (
      <div style={plannerContainerStyle}>
        {/* Back to Landing Button */}
        <button onClick={handleBackToLanding} style={backButtonStyle}>
          <span style={backIconStyle}>←</span>
          <span>Back to Home</span>
        </button>



        <Planner onPlan={handlePlanGenerated} />
      </div>
    );
  }

  if (currentPage === "results") {
    return (
      <div>
        {/* Back to Planner Button */}
        <div style={resultsHeaderStyle}>
          <button onClick={handleBackToPlanner} style={backButtonStyle}>
            <span style={backIconStyle}>←</span>
            <span>Edit Plan</span>
          </button>
          <button onClick={handleBackToLanding} style={homeButtonStyle}>
            <span style={homeIconStyle}>🏠</span>
            <span>New Plan</span>
          </button>
        </div>

        <Results plan={plan} />
      </div>
    );
  }

  return null;
}

// Styles for App navigation
const plannerContainerStyle: React.CSSProperties = {
  position: "relative",
  minHeight: "100vh",
};

const backButtonStyle: React.CSSProperties = {
  position: "fixed",
  top: "30px",
  left: "30px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 20px",
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(102, 126, 234, 0.2)",
  borderRadius: "12px",
  color: "#667eea",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.2s ease",
  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
  backdropFilter: "blur(10px)",
  zIndex: 1000,
};

const backIconStyle: React.CSSProperties = {
  fontSize: "16px",
};

const homeButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 20px",
  background: "rgba(255,255,255,0.9)",
  border: "1px solid rgba(102, 126, 234, 0.2)",
  borderRadius: "12px",
  color: "#667eea",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.2s ease",
  boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
  backdropFilter: "blur(10px)",
};

const homeIconStyle: React.CSSProperties = {
  fontSize: "16px",
};

const resultsHeaderStyle: React.CSSProperties = {
  position: "fixed",
  top: "30px",
  left: "30px",
  right: "30px",
  display: "flex",
  justifyContent: "space-between",
  zIndex: 1000,
};



// Add hover effects
const style = document.createElement('style');
style.textContent = `
  .back-button:hover,
  .home-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.2);
    background: rgba(255,255,255,1);
  }
`;
document.head.appendChild(style);