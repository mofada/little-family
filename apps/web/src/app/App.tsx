import AppGate from "./components/AppGate";
import { FamilyProvider } from "./context/FamilyContext";

export default function App() {
  return <FamilyProvider><AppGate /></FamilyProvider>;
}
