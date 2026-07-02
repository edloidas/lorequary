import {useRef, useState} from 'react';

import {cn} from '@/shared/lib/cn';

import type {PointerEvent as ReactPointerEvent, ReactElement, ReactNode} from 'react';

export type ResizablePanelProps = {
  // Which edge carries the resize handle; dragging away from the panel widens it.
  edge: 'left' | 'right';
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  className?: string;
  children?: ReactNode;
};

const readStoredWidth = (key: string, fallback: number, min: number, max: number): number => {
  const stored = Number(localStorage.getItem(key));

  return Number.isFinite(stored) && stored >= min && stored <= max ? stored : fallback;
};

export const ResizablePanel = ({
  edge,
  storageKey,
  defaultWidth,
  minWidth = 220,
  maxWidth = 600,
  className,
  children,
}: ResizablePanelProps): ReactElement => {
  const widthRef = useRef(0);
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth));

  widthRef.current = width;

  const handlePointerDown = (event: ReactPointerEvent): void => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = widthRef.current;

    const handleMove = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientX - startX;
      const next = edge === 'right' ? startWidth + delta : startWidth - delta;

      setWidth(Math.min(maxWidth, Math.max(minWidth, next)));
    };

    const handleUp = (): void => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      localStorage.setItem(storageKey, String(widthRef.current));
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleClasses = cn(
    'absolute top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-sky-500/40 active:bg-sky-500/60',
    edge === 'right' ? 'right-0' : 'left-0',
  );

  return (
    <aside className={cn('relative shrink-0', className)} style={{width}}>
      {children}
      <div className={handleClasses} onPointerDown={handlePointerDown} />
    </aside>
  );
};

ResizablePanel.displayName = 'ResizablePanel';
