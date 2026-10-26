import { useEffect, useState } from "react";

/** The value, but only after it stayed unchanged for delayMs. Keeps live checks from firing on every key press. */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
