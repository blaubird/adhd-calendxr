'use client';
import { useEffect, useState } from 'react';

// WMO Weather interpretation codes (https://open-meteo.com/en/docs)
function getWeatherIcon(code: number) {
  if (code === 0) return '☀️'; // Clear sky
  if (code === 1 || code === 2 || code === 3) return '⛅'; // Mainly clear, partly cloudy, and overcast
  if (code >= 45 && code <= 67) return '🌧️'; // Fog, Drizzle, Rain
  if (code >= 71 && code <= 86) return '❄️'; // Snow
  if (code >= 95 && code <= 99) return '⛈️'; // Thunderstorm
  return '☁️';
}

export function WeatherWidget() {
  const [forecast, setForecast] = useState<any>(null);
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=48.8534&longitude=2.3488&daily=weathercode,temperature_2m_max,temperature_2m_min&current_weather=true&timezone=Europe%2FParis'
        );
        if (res.ok) {
          const data = await res.json();
          setForecast(data.daily);
          if (data.current_weather) {
            setCurrentTemp(Math.round(data.current_weather.temperature));
          }
        }
      } catch (err) {
        console.error('Weather fetch error', err);
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, []);

  if (loading || !forecast) {
    return <div className="weather-widget text-xs text-slate-500">Loading weather…</div>;
  }

  // We want Today, Tomorrow, Day After
  const days = ['Today', 'Tomorrow', 'Day After'];

  return (
    <div className="weather-widget flex flex-col gap-3 mt-4 pt-4 border-t border-slate-800">
      <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Paris Weather</h3>
      {days.map((label, i) => {
        const code = forecast.weathercode[i];
        const min = Math.round(forecast.temperature_2m_min[i]);
        const max = Math.round(forecast.temperature_2m_max[i]);
        const icon = getWeatherIcon(code);
        
        const mainTemp = label === 'Today' && currentTemp !== null ? currentTemp : Math.round((min + max) / 2);
        
        return (
          <div key={label} className="flex items-center justify-between text-xs text-slate-300 py-1">
            <span className="w-16">{label}</span>
            <span className="text-xl">{icon}</span>
            <div className="flex flex-col items-center w-28">
              <span className="text-white font-medium text-sm leading-none mb-1.5">{mainTemp}°</span>
              <div className="flex items-center gap-2 w-full">
                <span className="text-slate-500 text-[10px] w-4 text-right">{min}°</span>
                <div className="flex-1 h-1.5 rounded-full bg-gradient-to-r from-sky-900 to-rose-800 overflow-hidden relative">
                   <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/10" />
                </div>
                <span className="text-slate-400 text-[10px] w-4">{max}°</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
