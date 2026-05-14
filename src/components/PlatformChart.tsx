import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PLATFORM_META } from "../pages/Home";

interface ChartPoint {
  time: string;
  _timestamp: number;
  [key: string]: string | number;
}

interface ChannelSeries {
  key: string;
  channel: string;
  color: string;
  dashArray: string;
}

type ChartPlatformKey = "youtube" | "tiktok" | "facebook";
type PlatformName = "YouTube" | "TikTok" | "Facebook";

interface PlatformChartProps {
  platformName: PlatformName;
  latestSnapshot: string;
  total: number;
  history: ChartPoint[];
  series: ChannelSeries[];
  channels: string[];
  dashboardLoading: boolean;
}

const formatShortViewers = (value: number) =>
  new Intl.NumberFormat("es-BO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export default function PlatformChart({
  platformName,
  latestSnapshot,
  total,
  history,
  series,
  channels,
  dashboardLoading,
}: PlatformChartProps) {
  const platform = PLATFORM_META[platformName];
  const chartKey = platform.chartKey as ChartPlatformKey;
  const seriesNameByKey = new Map(series.map((s) => [s.key, s.channel]));

  return (
    <article className="flex min-h-[320px] flex-col rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Historiograma</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span
              className="rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wider"
              style={{ backgroundColor: platform.tint, color: platform.accent }}
            >
              {platform.badge}
            </span>
            <h2 className="font-serif text-2xl text-primary md:text-3xl">{platformName}</h2>
          </div>
          {channels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {channels.map((ch) => (
                <span
                  key={ch}
                  className="rounded-full border px-2 py-0.5 font-sans text-[11px] font-medium"
                  style={{ borderColor: platform.accent + "44", color: platform.accent, backgroundColor: platform.tint }}
                >
                  {ch}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <p className="font-sans text-sm text-gray-500">Ultima toma: {latestSnapshot}</p>
          <p className="mt-1 font-sans text-xs uppercase tracking-[0.18em] text-gray-400">
            {total.toLocaleString("es-ES")} viewers
          </p>
        </div>
      </div>

      {dashboardLoading ? (
        <div className="h-[240px] animate-pulse rounded-xl bg-gradient-to-b from-[#f4f7f5] to-[#ebf0ed]" />
      ) : history.length > 0 && series.length > 0 ? (
        <div className="h-[240px] w-full md:flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#d6dfd9" strokeDasharray="4 4" />
              <XAxis
                dataKey="time"
                tick={{ fill: "#5f7066", fontSize: 12 }}
                axisLine={{ stroke: "#c8d4cd" }}
                tickLine={{ stroke: "#c8d4cd" }}
              />
              <YAxis
                tickFormatter={(value) => formatShortViewers(Number(value))}
                tick={{ fill: "#5f7066", fontSize: 12 }}
                axisLine={{ stroke: "#c8d4cd" }}
                tickLine={{ stroke: "#c8d4cd" }}
              />
              <Tooltip
                cursor={{ stroke: platform.accent, strokeDasharray: "2 4" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #d7e2db",
                  borderRadius: "12px",
                }}
                labelStyle={{ color: platform.accent, fontWeight: 600 }}
                formatter={(value, name) => {
                  const labelName = seriesNameByKey.get(String(name)) ?? platformName;
                  return [`${Number(value ?? 0).toLocaleString("es-ES")} views`, labelName];
                }}
                labelFormatter={(label, payload) => {
                  const total = (payload ?? []).reduce((sum, item) => sum + Number(item?.value ?? 0), 0);
                  return `${label} - ${Number(total ?? 0).toLocaleString("es-ES")} views`;
                }}
              />
              {series.map((s) => (
                <Line
                  key={`${chartKey}-${s.key}`}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2.8}
                  strokeDasharray={s.dashArray}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c8d6ce] bg-[#f8fbf9] px-4 text-center">
          <p className="font-serif text-2xl text-primary">Esperando datos de {platformName}</p>
          <p className="mt-2 font-sans text-sm text-gray-600">
            El historiograma aparecera automaticamente cuando lleguen transmisiones en vivo.
          </p>
        </div>
      )}
    </article>
  );
}
