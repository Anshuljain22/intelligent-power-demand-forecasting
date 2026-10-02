"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ForecastPoint = {
  datetime: string;
  predicted_load: number;
  temperature: number;
  humidity: number;
  cloud_cover: number;
  wind_speed: number;
  is_public_holiday: number;
  holiday_name: string | null;
  holiday_type: string | null;
  scope: string | null;
};

type ForecastResponse = {
  forecast_date: string;
  forecast_start: string;
  forecast_end: string;
  interval_minutes: number;
  forecast_points: number;
  holiday: {
    is_public_holiday: boolean;
    holiday_name: string | null;
    holiday_type: string | null;
    scope: string | null;
  };
  forecast: ForecastPoint[];
};

/* ============================================================
   STATIC ANALYTICS FROM MODEL / EDA
   ============================================================ */

const hourlyDemand = [
  { hour: "00:00", load: 55100 },
  { hour: "01:00", load: 52700 },
  { hour: "02:00", load: 50900 },
  { hour: "03:00", load: 49500 },
  { hour: "04:00", load: 48900 },
  { hour: "05:00", load: 50100 },
  { hour: "06:00", load: 50190 },
  { hour: "07:00", load: 55800 },
  { hour: "08:00", load: 61100 },
  { hour: "09:00", load: 66300 },
  { hour: "10:00", load: 70400 },
  { hour: "11:00", load: 72800 },
  { hour: "12:00", load: 75100 },
  { hour: "13:00", load: 77100 },
  { hour: "14:00", load: 78500 },
  { hour: "15:00", load: 80100 },
  { hour: "16:00", load: 82400 },
  { hour: "17:00", load: 87900 },
  { hour: "18:00", load: 92800 },
  { hour: "19:00", load: 96100 },
  { hour: "20:00", load: 98037 },
  { hour: "21:00", load: 94900 },
  { hour: "22:00", load: 90200 },
  { hour: "23:00", load: 80100 },
];

const monthlyDemand = [
  { month: "Jan", load: 68173 },
  { month: "Feb", load: 67109 },
  { month: "Mar", load: 66561 },
  { month: "Apr", load: 67397 },
  { month: "May", load: 69994 },
  { month: "Jun", load: 75707 },
  { month: "Jul", load: 88174 },
  { month: "Aug", load: 85740 },
  { month: "Sep", load: 68500 },
  { month: "Oct", load: 67561 },
  { month: "Nov", load: 65105 },
  { month: "Dec", load: 63751 },
];

const weekdayDemand = [
  { day: "Mon", load: 71705 },
  { day: "Tue", load: 72063 },
  { day: "Wed", load: 72351 },
  { day: "Thu", load: 72531 },
  { day: "Fri", load: 71346 },
  { day: "Sat", load: 70850 },
  { day: "Sun", load: 67714 },
];

const featureImportance = [
  { feature: "lag_48", importance: 55.81 },
  { feature: "lag_96", importance: 21.36 },
  { feature: "lag_1", importance: 17.64 },
  { feature: "lag_336", importance: 1.21 },
  { feature: "rolling_mean_1h", importance: 0.97 },
  { feature: "historical_change_30min", importance: 0.56 },
  { feature: "hour", importance: 0.49 },
  { feature: "time_slot_cos", importance: 0.35 },
  { feature: "time_slot", importance: 0.25 },
  { feature: "rolling_mean_6h", importance: 0.18 },
];

const modelMetrics = [
  {
    metric: "MAE",
    validation: "661.05",
    test: "860.71",
  },
  {
    metric: "RMSE",
    validation: "903.85",
    test: "1259.82",
  },
  {
    metric: "MAPE",
    validation: "1.012%",
    test: "1.372%",
  },
  {
    metric: "R²",
    validation: "0.9954",
    test: "0.9922",
  },
];

/* ============================================================
   HELPERS
   ============================================================ */

function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00`);

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(datetime: string) {
  const d = new Date(datetime.replace(" ", "T"));

  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatLoad(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function average(values: number[]) {
  if (!values.length) return 0;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function GlassIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/70">
      {children}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/30">
        {eyebrow}
      </div>

      <h2 className="mt-2 text-xl font-medium tracking-tight text-white">
        {title}
      </h2>

      {description && (
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/35">
          {description}
        </p>
      )}
    </div>
  );
}

/* ============================================================
   PAGE
   ============================================================ */

export default function Home() {
  const [selectedDate, setSelectedDate] =
    useState("2017-12-25");

  const [forecast, setForecast] =
    useState<ForecastResponse | null>(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");

  const [activeChart, setActiveChart] =
    useState<"demand" | "weather">("demand");

  const [analyticsChart, setAnalyticsChart] =
    useState<"hourly" | "monthly" | "weekly">("hourly");

  async function loadForecast(date = selectedDate) {
    setLoading(true);
    setError("");

    try {
      const datetime = `${date} 00:00:00`;

      const response = await fetch(
        `${API_URL}/forecast?datetime=${encodeURIComponent(
          datetime
        )}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        throw new Error(
          errorData?.detail ||
            `Unable to generate forecast (${response.status})`
        );
      }

      const data: ForecastResponse = await response.json();

      setForecast(data);
    } catch (err) {
      console.error(err);

      setForecast(null);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load forecast."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadForecast();
  }, []);

  /* ==========================================================
     DYNAMIC DATA
     ========================================================== */

  const chartData = useMemo(() => {
    if (!forecast) return [];

    return forecast.forecast.map((point) => ({
      time: formatTime(point.datetime),
      datetime: point.datetime,
      load: Math.round(point.predicted_load),
      temperature: point.temperature,
      humidity: point.humidity,
      cloud: point.cloud_cover,
      wind: point.wind_speed,
    }));
  }, [forecast]);

  const statistics = useMemo(() => {
    if (!forecast) return null;

    const loads = forecast.forecast.map(
      (point) => point.predicted_load
    );

    const temperatures = forecast.forecast.map(
      (point) => point.temperature
    );

    const humidities = forecast.forecast.map(
      (point) => point.humidity
    );

    const clouds = forecast.forecast.map(
      (point) => point.cloud_cover
    );

    const winds = forecast.forecast.map(
      (point) => point.wind_speed
    );

    const peakLoad = Math.max(...loads);
    const minimumLoad = Math.min(...loads);

    const peakIndex = loads.indexOf(peakLoad);
    const minimumIndex = loads.indexOf(minimumLoad);

    return {
      averageLoad: average(loads),
      peakLoad,
      minimumLoad,

      peakTime:
        forecast.forecast[peakIndex]?.datetime || "",

      minimumTime:
        forecast.forecast[minimumIndex]?.datetime || "",

      averageTemperature: average(temperatures),
      averageHumidity: average(humidities),
      averageCloud: average(clouds),
      averageWind: average(winds),
    };
  }, [forecast]);

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08090b] text-white">
      {/* Atmospheric background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[5%] top-[-10%] h-[500px] w-[500px] rounded-full bg-emerald-500/[0.055] blur-[140px]" />

        <div className="absolute right-[-5%] top-[15%] h-[600px] w-[600px] rounded-full bg-violet-500/[0.045] blur-[150px]" />

        <div className="absolute bottom-[-10%] left-[35%] h-[500px] w-[500px] rounded-full bg-orange-400/[0.035] blur-[150px]" />
      </div>

      <div className="relative mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">

        {/* ====================================================
            HEADER
        ==================================================== */}

        <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08]">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.7)]" />
              </div>

              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-white/35">
                Intelligent Energy Forecast
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Power Demand
              <span className="text-white/30">
                {" "}
                / Forecast
              </span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/40">
              Short-term electricity demand forecasting for
              Dhanbad using historical load, weather conditions,
              calendar effects and localized holidays.
            </p>
          </div>

          {/* Dynamic date control */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label
                htmlFor="forecast-date"
                className="mb-2 block text-[10px] font-medium uppercase tracking-[0.18em] text-white/30"
              >
                Forecast date
              </label>

              <input
                id="forecast-date"
                type="date"
                value={selectedDate}
                min="2017-01-08"
                max="2017-12-31"
                onChange={(event) =>
                  setSelectedDate(event.target.value)
                }
                className="h-12 rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm text-white outline-none backdrop-blur-xl transition focus:border-emerald-400/30 focus:bg-white/[0.08]"
              />
            </div>

            <button
              onClick={() => loadForecast()}
              disabled={loading}
              className="h-12 rounded-xl border border-white/10 bg-white/[0.075] px-6 text-sm font-medium text-white transition hover:border-emerald-400/25 hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading
                ? "Generating..."
                : "Generate forecast"}
            </button>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/20 bg-red-400/[0.055] p-5 backdrop-blur-xl">
            <div className="text-sm font-medium text-red-200">
              Forecast could not be generated
            </div>

            <div className="mt-1 text-xs leading-5 text-red-200/55">
              {error}
            </div>
          </div>
        )}

        {forecast && statistics && (
          <>
            {/* ==================================================
                CURRENT FORECAST OVERVIEW
            ================================================== */}

            <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_270px]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                      Forecast period
                    </div>

                    <div className="mt-2 text-2xl font-medium tracking-tight">
                      {formatDate(forecast.forecast_date)}
                    </div>

                    <div className="mt-1 text-sm text-white/35">
                      00:00 — 23:30 · 48 half-hour intervals
                    </div>
                  </div>

                  <div
                    className={`rounded-xl border px-5 py-4 ${
                      forecast.holiday.is_public_holiday
                        ? "border-amber-300/20 bg-amber-300/[0.055]"
                        : "border-white/10 bg-black/10"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${
                          forecast.holiday.is_public_holiday
                            ? "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.5)]"
                            : "bg-white/25"
                        }`}
                      />

                      <div>
                        <div className="text-[9px] uppercase tracking-[0.16em] text-white/30">
                          Calendar
                        </div>

                        <div className="mt-1 text-sm font-medium">
                          {forecast.holiday.is_public_holiday
                            ? forecast.holiday.holiday_name ||
                              "Public holiday"
                            : "Regular working day"}
                        </div>
                      </div>
                    </div>

                    {forecast.holiday.is_public_holiday &&
                      forecast.holiday.scope && (
                        <div className="mt-2 text-[11px] text-white/35">
                          {forecast.holiday.scope}
                        </div>
                      )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/30">
                  Average demand
                </div>

                <div className="mt-3 text-3xl font-semibold tracking-tight">
                  {formatLoad(statistics.averageLoad)}
                </div>

                <div className="mt-1 text-xs text-white/30">
                  forecast load units
                </div>
              </div>
            </section>

            {/* ==================================================
                DYNAMIC KPI ROW
            ================================================== */}

            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">
                    Peak demand
                  </span>

                  <GlassIcon>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8Z" />
                    </svg>
                  </GlassIcon>
                </div>

                <div className="mt-5 text-2xl font-semibold">
                  {formatLoad(statistics.peakLoad)}
                </div>

                <div className="mt-1 text-xs text-white/25">
                  {formatTime(statistics.peakTime)}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">
                    Minimum demand
                  </span>

                  <GlassIcon>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M4 12h16" />
                      <path d="M7 16l-3-4 3-4" />
                      <path d="M17 8l3 4-3 4" />
                    </svg>
                  </GlassIcon>
                </div>

                <div className="mt-5 text-2xl font-semibold">
                  {formatLoad(statistics.minimumLoad)}
                </div>

                <div className="mt-1 text-xs text-white/25">
                  {formatTime(statistics.minimumTime)}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">
                    Temperature
                  </span>

                  <GlassIcon>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />
                    </svg>
                  </GlassIcon>
                </div>

                <div className="mt-5 text-2xl font-semibold">
                  {statistics.averageTemperature.toFixed(
                    1
                  )}
                  °C
                </div>

                <div className="mt-1 text-xs text-white/25">
                  daily average
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/35">
                    Humidity
                  </span>

                  <GlassIcon>
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path d="M12 3s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12Z" />
                    </svg>
                  </GlassIcon>
                </div>

                <div className="mt-5 text-2xl font-semibold">
                  {statistics.averageHumidity.toFixed(0)}%
                </div>

                <div className="mt-1 text-xs text-white/25">
                  daily average
                </div>
              </div>
            </section>

            {/* ==================================================
                MAIN DYNAMIC FORECAST
            ================================================== */}

            <section className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 border-b border-white/[0.07] p-6 sm:flex-row sm:items-center sm:justify-between">
                <SectionHeading
                  eyebrow="Live forecast"
                  title="24-hour demand curve"
                  description="Predicted electricity demand generated at 30-minute intervals."
                />

                <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                  <button
                    onClick={() =>
                      setActiveChart("demand")
                    }
                    className={`rounded-lg px-4 py-2 text-xs transition ${
                      activeChart === "demand"
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    Demand
                  </button>

                  <button
                    onClick={() =>
                      setActiveChart("weather")
                    }
                    className={`rounded-lg px-4 py-2 text-xs transition ${
                      activeChart === "weather"
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/60"
                    }`}
                  >
                    Weather
                  </button>
                </div>
              </div>

              <div className="h-[400px] px-3 pb-6 pt-6 sm:px-6">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  {activeChart === "demand" ? (
                    <AreaChart
                      data={chartData}
                      margin={{
                        top: 10,
                        right: 15,
                        left: 0,
                        bottom: 5,
                      }}
                    >
                      <defs>
                        <linearGradient
                          id="demandFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#d1d5db"
                            stopOpacity={0.18}
                          />

                          <stop
                            offset="100%"
                            stopColor="#d1d5db"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="rgba(255,255,255,0.055)"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="time"
                        tick={{
                          fill: "rgba(255,255,255,0.3)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        interval={3}
                      />

                      <YAxis
                        tick={{
                          fill: "rgba(255,255,255,0.3)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `${Math.round(value / 1000)}k`
                        }
                        width={42}
                      />

                      <Tooltip
                        contentStyle={{
                          background:
                            "rgba(16,17,20,0.95)",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          color: "#fff",
                        }}
                        labelStyle={{
                          color:
                            "rgba(255,255,255,0.45)",
                          marginBottom: 5,
                        }}
                        formatter={(value) => [
                          formatLoad(Number(value)),
                          "Predicted load",
                        ]}
                      />

                      <Area
                        type="monotone"
                        dataKey="load"
                        stroke="#e5e7eb"
                        strokeWidth={2}
                        fill="url(#demandFill)"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: "#fff",
                          stroke: "#fff",
                        }}
                      />
                    </AreaChart>
                  ) : (
                    <LineChart
                      data={chartData}
                      margin={{
                        top: 10,
                        right: 15,
                        left: 0,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.055)"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="time"
                        tick={{
                          fill: "rgba(255,255,255,0.3)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        interval={3}
                      />

                      <YAxis
                        tick={{
                          fill: "rgba(255,255,255,0.3)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />

                      <Tooltip
                        contentStyle={{
                          background:
                            "rgba(16,17,20,0.95)",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          color: "#fff",
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="temperature"
                        name="Temperature"
                        stroke="#f0b36a"
                        strokeWidth={2}
                        dot={false}
                      />

                      <Line
                        type="monotone"
                        dataKey="humidity"
                        name="Humidity"
                        stroke="#a99ad6"
                        strokeWidth={1.6}
                        dot={false}
                      />

                      <Line
                        type="monotone"
                        dataKey="cloud"
                        name="Cloud cover"
                        stroke="#9ca3af"
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </section>

            {/* ==================================================
                WEATHER DETAILS
            ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
                <SectionHeading
                  eyebrow="Environmental conditions"
                  title="Dhanbad weather"
                  description="Weather variables supplied to the forecasting pipeline for the selected date."
                />

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                    <div className="text-xs text-white/30">
                      Temperature
                    </div>

                    <div className="mt-3 text-xl font-medium">
                      {statistics.averageTemperature.toFixed(
                        1
                      )}
                      °C
                    </div>

                    <div className="mt-1 text-[10px] text-white/20">
                      average
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                    <div className="text-xs text-white/30">
                      Humidity
                    </div>

                    <div className="mt-3 text-xl font-medium">
                      {statistics.averageHumidity.toFixed(
                        0
                      )}
                      %
                    </div>

                    <div className="mt-1 text-[10px] text-white/20">
                      relative humidity
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                    <div className="text-xs text-white/30">
                      Cloud cover
                    </div>

                    <div className="mt-3 text-xl font-medium">
                      {statistics.averageCloud.toFixed(0)}%
                    </div>

                    <div className="mt-1 text-[10px] text-white/20">
                      average coverage
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                    <div className="text-xs text-white/30">
                      Wind speed
                    </div>

                    <div className="mt-3 text-xl font-medium">
                      {statistics.averageWind.toFixed(1)}
                    </div>

                    <div className="mt-1 text-[10px] text-white/20">
                      km/h average
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
                <SectionHeading
                  eyebrow="Calendar context"
                  title="Localized holiday"
                />

                <div
                  className={`mt-6 rounded-xl border p-5 ${
                    forecast.holiday.is_public_holiday
                      ? "border-amber-300/15 bg-amber-300/[0.045]"
                      : "border-white/[0.07] bg-black/15"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        forecast.holiday.is_public_holiday
                          ? "bg-amber-300"
                          : "bg-white/20"
                      }`}
                    />

                    <span className="text-sm font-medium">
                      {forecast.holiday.is_public_holiday
                        ? "Public holiday"
                        : "Regular day"}
                    </span>
                  </div>

                  <div className="mt-5 text-lg font-medium">
                    {forecast.holiday.is_public_holiday
                      ? forecast.holiday.holiday_name ||
                        "Public holiday"
                      : "No recorded public holiday"}
                  </div>

                  {forecast.holiday.holiday_type && (
                    <div className="mt-2 text-xs text-white/35">
                      {forecast.holiday.holiday_type}
                    </div>
                  )}

                  {forecast.holiday.scope && (
                    <div className="mt-1 text-xs text-white/25">
                      Scope: {forecast.holiday.scope}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ==================================================
                FORECAST ANALYTICS
            ================================================== */}

            <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
              <SectionHeading
                eyebrow="Forecast analytics"
                title="What the selected forecast tells us"
                description="Summary statistics calculated directly from the generated 24-hour forecast."
              />

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                  <div className="text-xs text-white/30">
                    Forecast points
                  </div>

                  <div className="mt-3 text-2xl font-semibold">
                    {forecast.forecast_points}
                  </div>

                  <div className="mt-1 text-[11px] text-white/20">
                    half-hour observations
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                  <div className="text-xs text-white/30">
                    Resolution
                  </div>

                  <div className="mt-3 text-2xl font-semibold">
                    {forecast.interval_minutes}
                    <span className="ml-1 text-sm font-normal text-white/30">
                      min
                    </span>
                  </div>

                  <div className="mt-1 text-[11px] text-white/20">
                    forecasting interval
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                  <div className="text-xs text-white/30">
                    Peak period
                  </div>

                  <div className="mt-3 text-2xl font-semibold">
                    {formatTime(statistics.peakTime)}
                  </div>

                  <div className="mt-1 text-[11px] text-white/20">
                    highest predicted demand
                  </div>
                </div>

                <div className="rounded-xl border border-white/[0.07] bg-black/15 p-5">
                  <div className="text-xs text-white/30">
                    Demand range
                  </div>

                  <div className="mt-3 text-2xl font-semibold">
                    {formatLoad(
                      statistics.peakLoad -
                        statistics.minimumLoad
                    )}
                  </div>

                  <div className="mt-1 text-[11px] text-white/20">
                    peak minus minimum
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                HISTORICAL ANALYTICS
            ================================================== */}

            <section className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-2xl">
              <div className="flex flex-col gap-4 border-b border-white/[0.07] p-6 sm:flex-row sm:items-center sm:justify-between">
                <SectionHeading
                  eyebrow="Historical analysis"
                  title="Demand patterns discovered during EDA"
                  description="Historical load behavior used to understand seasonality, daily structure and weekly variation."
                />

                <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
                  <button
                    onClick={() =>
                      setAnalyticsChart("hourly")
                    }
                    className={`rounded-lg px-3 py-2 text-xs ${
                      analyticsChart === "hourly"
                        ? "bg-white/10 text-white"
                        : "text-white/30"
                    }`}
                  >
                    Hourly
                  </button>

                  <button
                    onClick={() =>
                      setAnalyticsChart("monthly")
                    }
                    className={`rounded-lg px-3 py-2 text-xs ${
                      analyticsChart === "monthly"
                        ? "bg-white/10 text-white"
                        : "text-white/30"
                    }`}
                  >
                    Monthly
                  </button>

                  <button
                    onClick={() =>
                      setAnalyticsChart("weekly")
                    }
                    className={`rounded-lg px-3 py-2 text-xs ${
                      analyticsChart === "weekly"
                        ? "bg-white/10 text-white"
                        : "text-white/30"
                    }`}
                  >
                    Weekly
                  </button>
                </div>
              </div>

              <div className="h-[380px] px-3 pb-6 pt-6 sm:px-6">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  {analyticsChart === "hourly" && (
                    <AreaChart data={hourlyDemand}>
                      <defs>
                        <linearGradient
                          id="historicalHourly"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#a7f3d0"
                            stopOpacity={0.13}
                          />

                          <stop
                            offset="100%"
                            stopColor="#a7f3d0"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="hour"
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `${Math.round(value / 1000)}k`
                        }
                      />

                      <Tooltip
                        contentStyle={{
                          background:
                            "rgba(16,17,20,0.95)",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                        }}
                        formatter={(value) => [
                          formatLoad(Number(value)),
                          "Historical load",
                        ]}
                      />

                      <Area
                        type="monotone"
                        dataKey="load"
                        stroke="#a7f3d0"
                        strokeWidth={2}
                        fill="url(#historicalHourly)"
                        dot={false}
                      />
                    </AreaChart>
                  )}

                  {analyticsChart === "monthly" && (
                    <BarChart data={monthlyDemand}>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="month"
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `${Math.round(value / 1000)}k`
                        }
                      />

                      <Tooltip
                        contentStyle={{
                          background:
                            "rgba(16,17,20,0.95)",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                        }}
                        formatter={(value) => [
                          formatLoad(Number(value)),
                          "Monthly mean",
                        ]}
                      />

                      <Bar
                        dataKey="load"
                        fill="#c4b5fd"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  )}

                  {analyticsChart === "weekly" && (
                    <BarChart data={weekdayDemand}>
                      <CartesianGrid
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="day"
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        tick={{
                          fill: "rgba(255,255,255,0.28)",
                          fontSize: 10,
                        }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `${Math.round(value / 1000)}k`
                        }
                      />

                      <Tooltip
                        contentStyle={{
                          background:
                            "rgba(16,17,20,0.95)",
                          border:
                            "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                        }}
                        formatter={(value) => [
                          formatLoad(Number(value)),
                          "Mean load",
                        ]}
                      />

                      <Bar
                        dataKey="load"
                        fill="#d6d3d1"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="grid border-t border-white/[0.07] sm:grid-cols-3">
                <div className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/25">
                    Evening peak
                  </div>

                  <div className="mt-2 text-lg font-medium">
                    ~98,037
                  </div>

                  <div className="mt-1 text-xs text-white/25">
                    highest hourly historical demand
                  </div>
                </div>

                <div className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/25">
                    Weekday average
                  </div>

                  <div className="mt-2 text-lg font-medium">
                    71,999
                  </div>

                  <div className="mt-1 text-xs text-white/25">
                    historical weekday mean
                  </div>
                </div>

                <div className="p-5">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/25">
                    Weekend average
                  </div>

                  <div className="mt-2 text-lg font-medium">
                    69,282
                  </div>

                  <div className="mt-1 text-xs text-white/25">
                    historical weekend mean
                  </div>
                </div>
              </div>
            </section>

            {/* ==================================================
                MODEL PERFORMANCE
            ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
                <SectionHeading
                  eyebrow="Model evaluation"
                  title="XGBoost performance"
                  description="Final model performance measured on chronological validation and held-out test data."
                />

                <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.07]">
                  <div className="grid grid-cols-3 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-white/25">
                    <span>Metric</span>
                    <span>Validation</span>
                    <span>Test</span>
                  </div>

                  {modelMetrics.map((item) => (
                    <div
                      key={item.metric}
                      className="grid grid-cols-3 border-b border-white/[0.05] px-4 py-4 last:border-0"
                    >
                      <span className="text-sm text-white/55">
                        {item.metric}
                      </span>

                      <span className="text-sm font-medium">
                        {item.validation}
                      </span>

                      <span className="text-sm font-medium text-white/65">
                        {item.test}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model configuration */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
                <SectionHeading
                  eyebrow="Final architecture"
                  title="Forecasting model"
                  description="The final production artifact used by the FastAPI backend."
                />

                <div className="mt-6 space-y-2">
                  {[
                    ["Model", "XGBoost Regressor"],
                    ["Features", "34"],
                    ["Forecast horizon", "24 hours"],
                    ["Resolution", "30 minutes"],
                    ["Forecast points", "48"],
                    ["Strategy", "Recursive forecasting"],
                    ["History", "7-day lag available"],
                    ["Target", "Total_Load"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3"
                    >
                      <span className="text-xs text-white/30">
                        {label}
                      </span>

                      <span className="text-right text-sm text-white/70">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ==================================================
                FEATURE IMPORTANCE
            ================================================== */}

            <section className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] backdrop-blur-2xl">
              <div className="p-6">
                <SectionHeading
                  eyebrow="Model interpretation"
                  title="Feature importance"
                  description="Relative contribution reported by the final XGBoost model. Historical demand features dominate the short-term forecast, while weather and holiday variables remain part of the production feature set."
                />
              </div>

              <div className="h-[430px] px-3 pb-7 sm:px-6">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={featureImportance}
                    layout="vertical"
                    margin={{
                      top: 5,
                      right: 20,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid
                      stroke="rgba(255,255,255,0.04)"
                      horizontal={false}
                    />

                    <XAxis
                      type="number"
                      tick={{
                        fill: "rgba(255,255,255,0.25)",
                        fontSize: 10,
                      }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) =>
                        `${value}%`
                      }
                    />

                    <YAxis
                      type="category"
                      dataKey="feature"
                      width={145}
                      tick={{
                        fill: "rgba(255,255,255,0.4)",
                        fontSize: 10,
                      }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        background:
                          "rgba(16,17,20,0.95)",
                        border:
                          "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "12px",
                      }}
                      formatter={(value) => [
                        `${Number(value).toFixed(2)}%`,
                        "Importance",
                      ]}
                    />

                    <Bar
                      dataKey="importance"
                      fill="#a7f3d0"
                      radius={[0, 5, 5, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* ==================================================
                METHODOLOGY
            ================================================== */}

            <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
              <SectionHeading
                eyebrow="Production pipeline"
                title="How the forecast is generated"
                description="The deployed prediction flow follows the same feature definitions validated against the training pipeline."
              />

              <div className="mt-7 grid gap-3 md:grid-cols-5">
                {[
                  {
                    n: "01",
                    title: "Historical load",
                    text: "Previous demand observations provide lag and rolling context.",
                  },
                  {
                    n: "02",
                    title: "Weather",
                    text: "Dhanbad temperature, humidity, cloud cover and wind are aligned to 30-minute intervals.",
                  },
                  {
                    n: "03",
                    title: "Calendar",
                    text: "Time features, weekly patterns and localized holiday information are added.",
                  },
                  {
                    n: "04",
                    title: "XGBoost",
                    text: "The trained model predicts the next 30-minute demand point.",
                  },
                  {
                    n: "05",
                    title: "Recursive loop",
                    text: "Each prediction becomes historical context for the following interval.",
                  },
                ].map((step) => (
                  <div
                    key={step.n}
                    className="rounded-xl border border-white/[0.07] bg-black/10 p-5"
                  >
                    <div className="text-[10px] font-medium tracking-[0.15em] text-emerald-300/60">
                      {step.n}
                    </div>

                    <div className="mt-4 text-sm font-medium">
                      {step.title}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-white/30">
                      {step.text}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ==================================================
                DATASET / VALIDATION SUMMARY
            ================================================== */}

            <section className="mb-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/25">
                  Historical data
                </div>

                <div className="mt-4 text-2xl font-semibold">
                  17,472
                </div>

                <p className="mt-2 text-xs leading-5 text-white/30">
                  Integrated 30-minute observations covering
                  historical load, Dhanbad weather and holiday
                  information.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/25">
                  Production features
                </div>

                <div className="mt-4 text-2xl font-semibold">
                  34
                </div>

                <p className="mt-2 text-xs leading-5 text-white/30">
                  Calendar, lag, rolling, weather and holiday
                  features used by the trained model.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-xl">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/25">
                  Feature parity
                </div>

                <div className="mt-4 text-2xl font-semibold">
                  PASS
                </div>

                <p className="mt-2 text-xs leading-5 text-white/30">
                  Production feature generation matched saved
                  training features within floating-point tolerance.
                </p>
              </div>
            </section>

            {/* ==================================================
                FOOTER
            ================================================== */}

            <footer className="flex flex-col gap-2 border-t border-white/[0.07] py-6 text-[11px] text-white/20 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Intelligent Power Demand Forecasting · Dhanbad
              </span>

              <span>
                XGBoost · 34 features · 30-minute resolution
              </span>
            </footer>
          </>
        )}

        {/* ======================================================
            LOADING STATE
        ====================================================== */}

        {!forecast && loading && (
          <div className="flex min-h-[500px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/70" />

              <div className="mt-4 text-sm text-white/35">
                Generating 24-hour forecast...
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}