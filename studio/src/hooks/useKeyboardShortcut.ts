import { useEffect } from 'react';

export function useKeyboardShortcut(key: string, callback: () => void, deps: React.DependencyList = []) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const parts = key.toLowerCase().split('+');
      const k = parts[parts.length - 1];
      const cmd = parts.includes('cmd') || parts.includes('meta');
      const shift = parts.includes('shift');
      const alt = parts.includes('alt');
      const ctrl = parts.includes('ctrl');

      const matchesKey = e.key.toLowerCase() === k;
      const matchesModifier = 
        (cmd ? (e.metaKey || e.ctrlKey) : true) &&
        (shift ? e.shiftKey : true) &&
        (alt ? e.altKey : true) &&
        (ctrl ? e.ctrlKey : true);

      // If key is just a char, ensure no modifiers unless specified
      if (parts.length === 1) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
      }

      if (matchesKey && matchesModifier) {
        // Only block if we're not in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          if (k !== 'escape' && k !== '\\' && !cmd) return;
        }
        
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, deps);
}
