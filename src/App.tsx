import { ErrorBoundary } from './game/ErrorBoundary.tsx';
import GameApp from './ui/GameApp.tsx';

export default function App() {
  return (
    <ErrorBoundary>
      <GameApp />
    </ErrorBoundary>
  );
}
