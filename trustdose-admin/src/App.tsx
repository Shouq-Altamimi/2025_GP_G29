import { Routes, Route, Link } from "react-router-dom";
import Pharmacy from "./Pharmacy";
import Admindashboard from "./Admindashboard";

function Home() {
  return <h2 style={{ padding: 16 }}>Welcome to TrustDose 🚀</h2>;
}

export default function App() {
  return (
    <div>
      <nav style={{ padding: 10, background: "#eee" }}>
       
        <Link to="/pharmacy">Pharmacy</Link> |{" "}
        <Link to="/Admindashboard">Admindashboard</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pharmacy" element={<Pharmacy />} />
        <Route path="/Admindashboard" element={<Admindashboard />} />
      </Routes>
    </div>
  );
}
