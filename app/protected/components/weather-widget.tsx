'use client';
import { useEffect, useState } from 'react';

// WMO Weather interpretation codes (https://open-meteo.com/en/docs)
function getWeatherIcon(code: unknown) {
  const weatherCode = Number(code);
  if (!Number.isFinite(weatherCode)) return '☁️';
  if (weatherCode === 0) return '☀️';
  if (weatherCode === 1 || weatherCode === 2) return '⛅';
  if (weatherCode === 3) return '☁️';
  if (weatherCode === 45 || weatherCode === 48) return '🌫️';
  if ((weatherCode >= 51 && weatherCode <= 67) || (weatherCode >= 80 && weatherCode <= 82)) return '🌧️';
  if ((weatherCode >= 71 && weatherCode <= 77) || weatherCode === 85 || weatherCode === 86) return '❄️';
  if (weatherCode >= 95 && weatherCode <= 99) return '⛈️';
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
          'https://api.open-meteo.com/v1/forecast?latitude=48.8534&longitude=2.3488&daily=weather_code,temperature_2m_max,temperature_2m_min&current=temperature_2m&timezone=Europe%2FParis'
        );
        if (res.ok) {
          const data = await res.json();
          setForecast(data.daily);
          if (data.current) {
            setCurrentTemp(Math.round(data.current.temperature_2m));
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

  const days = ['D+0', 'D+1', 'D+2'];

  return (
    <div className="weather-widget">
      <h3 className="weather-title">Paris Weather</h3>
      {days.map((label, i) => {
        const code = forecast.weather_code?.[i] ?? forecast.weathercode?.[i];
        const min = Math.round(forecast.temperature_2m_min[i]);
        const max = Math.round(forecast.temperature_2m_max[i]);
        const icon = getWeatherIcon(code);

        const mainTemp = i === 0 && currentTemp !== null ? currentTemp : Math.round((min + max) / 2);

        return (
          <div key={label} className="weather-row">
            <span className="weather-label">{label}</span>
            <span className="weather-icon">{icon}</span>
            <div className="weather-temp-wrap">
              <span className="weather-main-temp">{mainTemp}°</span>
              <div className="weather-range">
                <span className="weather-range-temp weather-range-temp--min">{min}°</span>
                <div className="weather-bar" />
                <span className="weather-range-temp weather-range-temp--max">{max}°</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
