import { Routes, Route, Link } from "react-router-dom";
import Pharmacy from "./Pharmacy";
import Admindashboard from "./Admindashboard";
import Patient from "./Patient";
import Doctor from "./Doctor";   // 👈 الاستيراد الجديد

function Home() {
  return <h2 style={{ padding: 16 }}>Welcome to TrustDose 🚀</h2>;
}

export default function App() {
  return (
    <div>
      <nav style={{ padding: 10, background: "#eee" }}>
        <Link to="/pharmacy">Pharmacy</Link> |{" "}
        <Link to="/Admindashboard">Admindashboard</Link> |{" "}
        <Link to="/patient">Patient</Link> |{" "}
        <Link to="/doctor">Doctor</Link>   
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pharmacy" element={<Pharmacy />} />
        <Route path="/Admindashboard" element={<Admindashboard />} />
        <Route path="/patient" element={<Patient />} />
        <Route path="/doctor" element={<Doctor />} />  
      </Routes>
    </div>
  );
}
