interface UserCardProps {
  username: string;
  viewerCount: number;
  platform: "TikTok" | "YouTube" | "Facebook";
  isTrending?: boolean;
  metadata?: string;
}

export default function UserCard({
  username,
  viewerCount,
  platform,
  isTrending = false,
  metadata,
}: UserCardProps) {
  const isTikTok = platform === "TikTok";
  const isFacebook = platform === "Facebook";

  return (
    <div
      className={`group rounded-2xl border p-5 transition-all duration-300 md:p-6 ${
        isTrending
          ? "border-primary bg-gradient-to-r from-[#f4fbf6] to-white shadow-[0_20px_36px_-24px_rgba(31,93,58,0.75)]"
          : "border-[#d9e2dc] bg-white shadow-[0_16px_34px_-28px_rgba(31,93,58,0.75)] hover:border-primary/35 hover:shadow-[0_20px_38px_-26px_rgba(31,93,58,0.75)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wider ${
                isTikTok
                  ? "bg-[#ecf4ef] text-primary"
                  : isFacebook
                  ? "bg-[#e9f0ff] text-[#1d4ed8]"
                  : "bg-[#fdeced] text-[#b91c1c]"
              }`}
            >
              {platform}
            </span>
            <span className="flex items-center gap-2 rounded-full bg-[#fff0f0] px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wider text-[#b42323]">
              <span className="live-dot" />
              Live
            </span>
            {isTrending && (
              <span className="rounded-full bg-[#fff6dd] px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wider text-[#8a5a00]">
                Trending
              </span>
            )}
          </div>

          <h3 className="truncate font-serif text-2xl text-primary md:text-[1.95rem]">@{username}</h3>

          <p className="mt-2 font-sans text-xs uppercase tracking-[0.16em] text-gray-500">
            {metadata ?? "Actualizando en vivo"}
          </p>
        </div>

        <div className="rounded-xl bg-[#f3f8f4] px-4 py-3 text-right">
          <p className="font-sans text-[11px] uppercase tracking-[0.16em] text-gray-500">Viewers</p>
          <p className="mt-1 live-count font-sans text-3xl font-bold leading-none text-primary md:text-4xl">
            {viewerCount.toLocaleString("es-ES")}
          </p>
          <p className="mt-1 font-sans text-xs text-gray-500">en vivo ahora</p>
          {isTrending && (
            <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
              Maximo actual
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-[#edf2ee]">
        <div
          className={`h-full w-full origin-left scale-x-100 transition-transform duration-700 group-hover:scale-x-95 ${
            isTikTok ? "bg-primary/70" : isFacebook ? "bg-[#1d4ed8]/70" : "bg-[#b91c1c]/70"
          }`}
        />
      </div>

      {isTrending && (
        <div className="mt-3 inline-flex rounded-full bg-primary px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
          Cobertura destacada
        </div>
      )}
    </div>
  );
}
