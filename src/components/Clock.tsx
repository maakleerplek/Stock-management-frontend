import { useState, useEffect } from 'react';

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center leading-none">
      <div className="text-xl font-semibold tabular-nums text-brand-black">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-[11px] font-medium text-grafiet mt-1">
        {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
    </div>
  );
}
