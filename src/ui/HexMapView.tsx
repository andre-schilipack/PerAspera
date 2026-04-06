import {
  axialToPixelPointyTop,
  boundsForHexDisk,
  DEFAULT_HEX_PIXEL_RADIUS,
  hexPolygonPointsPointyTop,
  viewBoxString,
} from '../domain/hexLayout.ts';
import type { Hex } from '../domain/types/index.ts';

export interface HexMapViewProps {
  hexes: readonly Hex[];
  currentHexId: string;
  homeHexId: string;
  centerHexId: string;
  neighborIds: ReadonlySet<string>;
  patrolStaCost: number;
  staminaCurrent: number;
  encounterPctLabel: (danger: number) => string;
  onPatrolTo: (hexId: string) => void;
}

const R = DEFAULT_HEX_PIXEL_RADIUS;

/**
 * Pointy-top hex map as SVG; neighbors with enough STA are clickable.
 */
export function HexMapView({
  hexes,
  currentHexId,
  homeHexId,
  centerHexId,
  neighborIds,
  patrolStaCost,
  staminaCurrent,
  encounterPctLabel,
  onPatrolTo,
}: HexMapViewProps) {
  const coords = hexes.map((h) => h.coordinates);
  const vb = viewBoxString(boundsForHexDisk(coords, R));

  return (
    <div className="hex-map-wrap">
      <svg
        className="hex-map-svg"
        viewBox={vb}
        role="img"
        aria-label="Hex map"
      >
        {hexes.map((h) => {
          const { x: cx, y: cy } = axialToPixelPointyTop(
            h.coordinates.q,
            h.coordinates.r,
            R,
          );
          const points = hexPolygonPointsPointyTop(cx, cy, R);
          const isCurrent = h.id === currentHexId;
          const isNeighbor = neighborIds.has(h.id) && !isCurrent;
          const canPatrol =
            isNeighbor &&
            h.isUnlocked &&
            staminaCurrent >= patrolStaCost;
          const locked = !h.isUnlocked;

          return (
            <g key={h.id} className="hex-map-cell">
              <title>
                {h.id}
                {h.id === centerHexId ? ' (Centro)' : ''}
                {h.id === homeHexId ? ' (Home)' : ''}
                {locked ? ' — locked' : ''}
              </title>
              <polygon
                className="hex-map-hex"
                points={points}
                data-current={isCurrent}
                data-neighbor={canPatrol}
                data-locked={locked}
                tabIndex={canPatrol ? 0 : -1}
                role={canPatrol ? 'button' : undefined}
                aria-label={
                  canPatrol
                    ? `Patrol to hex ${h.id}, ${patrolStaCost} STA`
                    : isCurrent
                      ? `Current hex ${h.id}`
                      : `Hex ${h.id}${locked ? ', locked' : ''}`
                }
                onClick={() => {
                  if (canPatrol) onPatrolTo(h.id);
                }}
                onKeyDown={(e) => {
                  if (!canPatrol) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPatrolTo(h.id);
                  }
                }}
              />
              <text
                className="hex-map-text hex-map-text-id"
                x={cx}
                y={cy - R * 0.32}
                textAnchor="middle"
                fontSize={R * 0.32}
              >
                {h.id}
                {h.id === centerHexId ? ' ·Ctr' : ''}
                {h.id === homeHexId ? ' ·Hm' : ''}
              </text>
              <text
                className="hex-map-text hex-map-text-stat"
                x={cx}
                y={cy + R * 0.12}
                textAnchor="middle"
                fontSize={R * 0.24}
              >
                dng {Math.round(h.danger)} enc~{encounterPctLabel(h.danger)}
              </text>
              <text
                className="hex-map-text hex-map-text-stat"
                x={cx}
                y={cy + R * 0.4}
                textAnchor="middle"
                fontSize={R * 0.22}
              >
                int {Math.round(h.integrity)}
                {locked ? ' locked' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
