import { useEffect, useState } from "react";

const defaultStartOfToday = new Date();
defaultStartOfToday.setHours(0, 0, 0, 0);

const defaultEndOfToday = new Date();
defaultEndOfToday.setHours(23, 59, 59, 999);

export const useGetTodayDate = () => {
  const [startOfToday, setStartOfToday] = useState(defaultStartOfToday);
  const [endOfToday, setEndOfToday] = useState(defaultEndOfToday);

  useEffect(() => {
    const updateDate = () => {
      const newStartOfToday = new Date();
      newStartOfToday.setHours(0, 0, 0, 0);
      setStartOfToday(newStartOfToday);

      const newEndOfToday = new Date();
      newEndOfToday.setHours(23, 59, 59, 999);
      setEndOfToday(newEndOfToday);
    };

    const interval = setInterval(updateDate, 1000 * 60);

    return () => clearInterval(interval);
  }, []);

  return { startOfToday, endOfToday };
};
