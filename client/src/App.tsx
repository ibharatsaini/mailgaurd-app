import { BrowserRouter, Routes, Route } from "react-router";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";


export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

      

        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  );
}
