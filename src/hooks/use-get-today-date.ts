import { useEffect, useState, useCallback } from "react";

/**
 * Hook that provides the start and end of the current day,
 * updating automatically when the day changes
 */
export const useGetTodayDate = () => {
  // Get start and end of today
  const getTodayBoundaries = useCallback(() => {
    const now = new Date();

    // Start of day (00:00:00.000)
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    // End of day (23:59:59.999)
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }, []);

  // Initialize state with current day boundaries
  const [{ startOfToday, endOfToday }, setTodayBoundaries] = useState(() => {
    const { start, end } = getTodayBoundaries();
    return {
      startOfToday: start,
      endOfToday: end,
    };
  });

  // Function to check if date has changed and update if needed
  const checkAndUpdateDate = useCallback(() => {
    const { start: newStart } = getTodayBoundaries();

    // Only update if the day has changed
    if (
      startOfToday.getDate() !== newStart.getDate() ||
      startOfToday.getMonth() !== newStart.getMonth() ||
      startOfToday.getFullYear() !== newStart.getFullYear()
    ) {
      const { start, end } = getTodayBoundaries();
      setTodayBoundaries({
        startOfToday: start,
        endOfToday: end,
      });
    }
  }, [startOfToday, getTodayBoundaries]);

  useEffect(() => {
    // Initial check
    checkAndUpdateDate();

    // Set up periodic checks - every minute is frequent enough
    // to catch day changes without being too resource intensive
    const interval = setInterval(checkAndUpdateDate, 60000);

    return () => clearInterval(interval);
  }, [checkAndUpdateDate]);

  return { startOfToday, endOfToday };
};
