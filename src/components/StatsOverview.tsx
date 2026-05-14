import { PLATFORM_META } from "../pages/Home";

interface User {
  username: string;
  viewerCount: number;
  isLive?: boolean;
}

interface StreamCardUser extends User {
  platform: "TikTok" | "YouTube" | "Facebook";
}

type PlatformName = "YouTube" | "TikTok" | "Facebook";

interface StatsOverviewProps {
  latestSnapshot: string;
  totalLiveViewers: number;
  totalLiveStreams: number;
  dashboardLoading: boolean;
  allStreams: StreamCardUser[];
  platformTotals: {
    YouTube: number;
    TikTok: number;
    Facebook: number;
  };
}

export default function StatsOverview({
  latestSnapshot,
  totalLiveViewers,
  totalLiveStreams,
  dashboardLoading,
  allStreams,
  platformTotals,
}: StatsOverviewProps) {
  return (
    <article className="flex min-h-[320px] flex-col rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Imagen general</p>
          <h2 className="mt-2 font-serif text-2xl text-primary md:text-3xl">Views en vivo</h2>
        </div>
        <div className="text-right">
          <p className="font-sans text-sm text-gray-500">Ultima toma: {latestSnapshot}</p>
          <p className="mt-1 font-sans text-xs uppercase tracking-[0.18em] text-gray-400">
            {totalLiveViewers.toLocaleString("es-ES")} viewers totales
          </p>
        </div>
      </div>

      {/* Stat destacado: número de transmisiones en vivo */}
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
          </span>
        </div>
        <div>
          <p className="font-sans text-2xl font-bold leading-none text-red-700">
            {dashboardLoading ? "—" : totalLiveStreams}
          </p>
          <p className="mt-0.5 font-sans text-[11px] uppercase tracking-[0.14em] text-red-500">
            {totalLiveStreams === 1 ? "transmisión en vivo" : "transmisiones en vivo"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-sans text-xl font-bold leading-none text-primary">
            {totalLiveViewers.toLocaleString("es-ES")}
          </p>
          <p className="mt-0.5 font-sans text-[11px] uppercase tracking-[0.14em] text-gray-500">viewers totales</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {(["YouTube", "TikTok", "Facebook"] as PlatformName[]).map((platformName) => {
          const platform = PLATFORM_META[platformName];
          const total = platformTotals[platformName];

          return (
            <div key={platformName} className="rounded-xl border border-[#d9e2dc] bg-[#f8fbf9] p-3">
              <p className="font-sans text-[11px] uppercase tracking-[0.14em] text-gray-500">{platformName}</p>
              <p className="mt-2 font-sans text-2xl font-bold leading-none" style={{ color: platform.accent }}>
                {total.toLocaleString("es-ES")}
              </p>
              <p className="mt-1 font-sans text-xs text-gray-500">views</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex-1 overflow-y-auto rounded-xl border border-[#d9e2dc] bg-[#fcfdfc] p-3">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.16em] text-gray-500">Canales activos</p>
        {allStreams.length > 0 ? (
          <div className="space-y-2">
            {allStreams.slice(0, 8).map((stream) => {
              const color =
                stream.platform === "YouTube"
                  ? "#b91c1c"
                  : stream.platform === "TikTok"
                  ? "#1f5d3a"
                  : "#1d4ed8";

              return (
                <div key={`${stream.platform}-${stream.username}`} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-sans text-sm font-medium text-primary">{stream.username}</p>
                    <p className="font-sans text-sm font-semibold" style={{ color }}>
                      {stream.viewerCount.toLocaleString("es-ES")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="font-sans text-sm text-gray-500">Sin transmisiones activas.</p>
          </div>
        )}
      </div>
    </article>
  );
}
