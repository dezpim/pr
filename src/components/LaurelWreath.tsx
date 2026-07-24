import React from "react";

interface LaurelWreathProps {
  size?: number;
  children: React.ReactNode;
  showRibbonTie?: boolean;
}

export function LaurelWreath(props: LaurelWreathProps) {
  const size = props.size || 72;
  const showRibbonTie = props.showRibbonTie !== false;

  return (
    <div className="laurel-wreath-wrapper" style={{ width: size, height: size }}>
      <svg className="laurel-wreath-svg" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="goldLaurelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="50%" stopColor="#FFB700" />
            <stop offset="100%" stopColor="#E68A00" />
          </linearGradient>
        </defs>

        <g fill="url(#goldLaurelGrad)">
          <path d="M 50 92 A 40 40 0 0 1 14 45" fill="none" stroke="url(#goldLaurelGrad)" strokeWidth="3" strokeLinecap="round" />
          <path d="M 40 88 C 30 86 24 78 30 72 C 34 76 40 82 40 88 Z" />
          <path d="M 36 84 C 28 78 26 68 34 66 C 36 72 38 80 36 84 Z" />
          <path d="M 26 70 C 16 64 14 52 24 48 C 26 54 28 64 26 70 Z" />
          <path d="M 20 54 C 12 46 12 34 22 32 C 24 38 24 48 20 54 Z" />
          <path d="M 22 38 C 16 28 20 16 30 18 C 28 26 26 34 22 38 Z" />
          <path d="M 30 24 C 28 14 36 6 44 12 C 38 18 34 22 30 24 Z" />
        </g>

        <g fill="url(#goldLaurelGrad)">
          <path d="M 50 92 A 40 40 0 0 0 86 45" fill="none" stroke="url(#goldLaurelGrad)" strokeWidth="3" strokeLinecap="round" />
          <path d="M 60 88 C 70 86 76 78 70 72 C 66 76 60 82 60 88 Z" />
          <path d="M 64 84 C 72 78 74 68 66 66 C 64 72 62 80 64 84 Z" />
          <path d="M 74 70 C 84 64 86 52 76 48 C 74 54 72 64 74 70 Z" />
          <path d="M 80 54 C 88 46 88 34 78 32 C 76 38 76 48 80 54 Z" />
          <path d="M 78 38 C 84 28 80 16 70 18 C 72 26 74 34 78 38 Z" />
          <path d="M 70 24 C 72 14 64 6 56 12 C 62 18 66 22 70 24 Z" />
        </g>

        {showRibbonTie && (
          <g fill="url(#goldLaurelGrad)">
            <path d="M 50 85 L 53 91 L 60 92 L 55 96 L 56 102 L 50 99 L 44 102 L 45 96 L 40 92 L 47 91 Z" />
          </g>
        )}
      </svg>

      <div className="laurel-wreath-content">
        {props.children}
      </div>
    </div>
  );
}
