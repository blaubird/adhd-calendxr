'use client';
import { useState, useEffect } from 'react';
import { TIMEZONE } from 'app/lib/datetime';

export function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  }).format(now);

  const dateStr = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(now);

  return (
    <div className="live-clock">
      <p className="live-clock-time">{time}</p>
      <p className="live-clock-date">{dateStr}</p>
      <p className="live-clock-tz">Paris</p>
    </div>
  );
}
