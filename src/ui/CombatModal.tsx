import type { ReactNode } from 'react';

export interface CombatModalProps {
  /** Visible modal content; when false the modal is not mounted. */
  open: boolean;
  /** Dialog title (combat mode). */
  title: string;
  /** Optional subtitle (location, context). */
  subtitle?: ReactNode;
  /** Status / HUD strip above the log. */
  hud?: ReactNode;
  /** Main combat body (typically the log + controls). */
  children: ReactNode;
  /** Actions below scroll region (Close, Flush log, etc.). */
  footer?: ReactNode;
  /** Extra classes on the inner panel. */
  panelClassName?: string;
}

/**
 * Full-screen prioritized modal for active combat (above standard modals).
 */
export function CombatModal({
  open,
  title,
  subtitle,
  hud,
  children,
  footer,
  panelClassName = '',
}: CombatModalProps) {
  if (!open) return null;

  return (
    <div
      className="game-combat-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-combat-modal-title"
    >
      <div className={`game-combat-modal ${panelClassName}`.trim()}>
        <h2 id="game-combat-modal-title">{title}</h2>
        {subtitle ? (
          <div className="game-combat-modal__subtitle">{subtitle}</div>
        ) : null}
        {hud ? <div className="game-combat-modal__hud">{hud}</div> : null}
        <div className="game-combat-modal__body">{children}</div>
        {footer ? (
          <div className="game-combat-modal__footer">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
