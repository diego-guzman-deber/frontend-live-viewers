interface DashboardHeaderProps {
  globalTitle: string;
  latestSnapshot: string;
  totalLiveStreams: number;
  totalLiveViewers: number;
  dashboardLoading: boolean;
  onClearHistory: () => void;
}

export default function DashboardHeader({
  globalTitle,
  latestSnapshot,
  totalLiveStreams,
  totalLiveViewers,
  dashboardLoading,
  onClearHistory,
}: DashboardHeaderProps) {
  return (
    <header className="rounded-2xl bg-white px-5 py-5 shadow-[0_20px_40px_-30px_rgba(31,93,58,0.8)] md:px-7 md:py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.24em] text-gray-500">Dashboard de monitoreo</p>
          <h1 className="mt-2 border-l-4 border-primary pl-4 font-serif text-3xl text-primary md:text-4xl">
            Portada en Vivo
          </h1>
          <p className="mt-2 font-sans text-sm text-gray-600">
            {globalTitle} - {latestSnapshot}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-full border border-[#d1ddd5] bg-white px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-primary transition hover:border-primary hover:bg-[#f4f8f5]"
          >
            Limpiar histórico
          </button>
          {/* Badge: transmisiones en vivo */}
          <div className="flex items-center gap-2 rounded-full bg-red-50 px-4 py-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
            </span>
            <span className="font-sans text-sm font-bold text-red-700">
              {dashboardLoading ? "—" : totalLiveStreams} EN VIVO
            </span>
          </div>
          {/* Badge: total viewers */}
          <div className="rounded-full bg-[#ecf4ef] px-4 py-2">
            <span className="font-sans text-sm font-bold text-primary">
              {totalLiveViewers.toLocaleString("es-ES")}
            </span>
            <span className="ml-1 font-sans text-xs uppercase tracking-wider text-primary opacity-70">viewers</span>
          </div>
          <div className="rounded-full bg-[#ecf4ef] px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-primary">
            Actualizacion continua
          </div>
        </div>
      </div>
    </header>
  );
}
