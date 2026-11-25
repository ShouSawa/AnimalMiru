import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import DB from "./pages/DB";
import CorrectRoute from "./pages/CorrectRoute";
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/db" element={<DB />} />
        <Route path="/correct-route" element={<CorrectRoute />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
