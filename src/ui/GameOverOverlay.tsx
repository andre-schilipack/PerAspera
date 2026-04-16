import { useState } from 'react';

import type { GameOverReason, HallOfFameEntry } from '../domain/types/index.ts';
import { startNewGame } from '../game/startNewGame.ts';
import { useMetaStore } from '../stores/useMetaStore.ts';

export interface GameOverOverlayProps {
  reason: GameOverReason;
  endedAt: number | null;
}

function reasonLabel(reason: GameOverReason): string {
  switch (reason) {
    case 'prefeitura_fallen':
      return 'The Prefeitura has fallen — the city administration is gone.';
    default:
      return 'The city can no longer hold.';
  }
}

function reasonShort(reason: GameOverReason): string {
  switch (reason) {
    case 'prefeitura_fallen':
      return 'Prefeitura fallen';
    default:
      return 'Game over';
  }
}

function formatEndedAt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function HallOfFameTable({ entries }: { entries: HallOfFameEntry['fameList'] }) {
  if (entries.length === 0) {
    return <p className="game-muted">No scores recorded for this run.</p>;
  }
  return (
    <table className="game-gameover-table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Name</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={`${e.characterId}-${i}`}>
            <td>{i + 1}</td>
            <td>{e.name}</td>
            <td>{e.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Blocks the entire app until the player starts a new run.
 */
export function GameOverOverlay({ reason, endedAt }: GameOverOverlayProps) {
  const [name, setName] = useState('');
  const hallOfFame = useMetaStore((s) => s.hallOfFame);
  const lastRun = hallOfFame.length > 0 ? hallOfFame[hallOfFame.length - 1] : null;
  const previousRuns =
    hallOfFame.length > 1 ? hallOfFame.slice(0, -1).reverse() : [];

  return (
    <div
      className="game-gameover-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
      aria-describedby="gameover-desc"
    >
      <div className="game-gameover-modal game-gameover-modal--wide">
        <h2 id="gameover-title">Game over</h2>
        <p id="gameover-desc">{reasonLabel(reason)}</p>
        {endedAt != null ? (
          <p className="game-muted">Run ended {formatEndedAt(endedAt)}</p>
        ) : null}
        {lastRun != null ? (
          <section className="game-gameover-section" aria-labelledby="gameover-top10">
            <h3 id="gameover-top10" className="game-gameover-subtitle">
              Top 10 — this run
            </h3>
            <p className="game-muted">
              City days (defense index): {lastRun.daysSurvived}
            </p>
            <HallOfFameTable entries={lastRun.fameList} />
          </section>
        ) : null}

        {previousRuns.length > 0 ? (
          <section className="game-gameover-section" aria-labelledby="gameover-hall">
            <h3 id="gameover-hall" className="game-gameover-subtitle">
              Hall of fame (previous runs)
            </h3>
            <ul className="game-gameover-hall-list">
              {previousRuns.map((run, idx) => (
                <li key={`${run.gameOverDateTime}-${idx}`} className="game-gameover-hall-item">
                  <div className="game-gameover-hall-meta">
                    <span>{formatEndedAt(run.gameOverDateTime)}</span>
                    <span className="game-muted">
                      · {run.daysSurvived} city days · {reasonShort(run.reason)}
                    </span>
                  </div>
                  <ol className="game-gameover-hall-top">
                    {run.fameList.slice(0, 3).map((e, i) => (
                      <li key={`${e.characterId}-${i}`}>
                        {e.name} — {e.score}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="game-muted">
          Start a new city — your previous save in this slot is preserved until you
          confirm. Hall of fame is kept across runs on this device.
        </p>
        <label className="game-gameover-name">
          Character name{' '}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={48}
            autoComplete="off"
          />
        </label>
        <button type="button" onClick={() => startNewGame(name)}>
          New game
        </button>
      </div>
    </div>
  );
}
