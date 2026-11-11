import { useEffect } from 'react';

interface ShortcutHandlers {
  undo: () => void;
  redo: () => void;
  save: () => void;
  focusSearch: () => void;
  clearSelection: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;

  return (
    element?.tagName === 'INPUT' ||
    element?.tagName === 'TEXTAREA' ||
    element?.isContentEditable === true
  );
};

/**
 * Window-level shortcuts. Text fields keep their own undo stack, so the editor
 * history only intercepts the keys when the user is not typing.
 */
export const useEditorShortcuts = (handlers: ShortcutHandlers): void => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const typing = isEditable(event.target);

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handlers.save();
        return;
      }

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        handlers.focusSearch();
        return;
      }

      if (typing) {
        return;
      }

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();

        if (event.shiftKey) {
          handlers.redo();
        } else {
          handlers.undo();
        }
        return;
      }

      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handlers.redo();
        return;
      }

      if (event.key === 'Escape') {
        handlers.clearSelection();
        return;
      }

      if (event.key === '+' || event.key === '=') {
        handlers.zoomIn();
        return;
      }

      if (event.key === '-') {
        handlers.zoomOut();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
};
