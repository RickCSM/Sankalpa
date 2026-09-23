import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'wouter';

interface NavHistoryValue {
  goBack: () => void;
}

const NavHistoryContext = createContext<NavHistoryValue | null>(null);

export function useNavHistory(): NavHistoryValue {
  const ctx = useContext(NavHistoryContext);
  if (!ctx) throw new Error('useNavHistory must be used within <NavHistoryProvider>');
  return ctx;
}

/**
 * Tracks in-app navigation in a private stack so a "Back" control can return to
 * the previous page WITHOUT calling window.history.back() (which the global
 * back-guard intercepts as a logout request). Navigation uses wouter's push so
 * it never triggers a popstate.
 */
export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const stackRef = useRef<string[]>([]);
  const skipRef = useRef(false);

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const stack = stackRef.current;
    if (stack[stack.length - 1] !== location) {
      stack.push(location);
      if (stack.length > 50) stack.shift();
    }
  }, [location]);

  const goBack = useCallback(() => {
    const stack = stackRef.current;
    if (stack.length >= 2) {
      stack.pop();
      const prev = stack[stack.length - 1];
      skipRef.current = true;
      navigate(prev);
    } else {
      navigate('/');
    }
  }, [navigate]);

  return (
    <NavHistoryContext.Provider value={{ goBack }}>
      {children}
    </NavHistoryContext.Provider>
  );
}
