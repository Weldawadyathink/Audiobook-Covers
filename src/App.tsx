import "./App.css";
import { TestModule } from "./TestModule.tsx";
import { TRPCReactProvider } from "./utils/trpc.tsx";

function App() {
  return (
    <TRPCReactProvider>
      <TestModule />
    </TRPCReactProvider>
  );
}

export default App;
