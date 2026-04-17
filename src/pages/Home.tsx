import { useCallback, useEffect, useRef, useState } from "react";
import UserCard from "../components/UserCard";
import { API_ENDPOINTS } from "../config";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface User {
  username: string;
  viewerCount: number;
  isLive?: boolean;
}

interface ChartPoint {
  time: string;
  tiktok: number;
  youtube: number;
  facebook: number;
}

interface StreamCardUser extends User {
  platform: "TikTok" | "YouTube" | "Facebook";
}

const USE_MOCK_DATA = false;

const MOCK_TIKTOK_USERS: User[] = [
  { username: "jhonnyplatacaba", viewerCount: 3299, isLive: true },
  { username: "deber_tv_bo", viewerCount: 2140, isLive: true },
  { username: "noticias.scz", viewerCount: 1810, isLive: true },
];

const MOCK_YOUTUBE_USERS: User[] = [
  { username: "ElDeberTV", viewerCount: 2950, isLive: true },
  { username: "BoliviaLiveNews", viewerCount: 1730, isLive: true },
  { username: "DebateEnVivo", viewerCount: 1255, isLive: true },
];

const MOCK_FACEBOOK_USERS: User[] = [
  { username: "ElDeberNoticias", viewerCount: 4010, isLive: true },
  { username: "DebersLive", viewerCount: 2460, isLive: true },
  { username: "CoberturaCentral", viewerCount: 1695, isLive: true },
];

const PLATFORM_META = {
  YouTube: {
    chartKey: "youtube" as const,
    accent: "#b91c1c",
    tint: "#fdeced",
    badge: "YT",
  },
  TikTok: {
    chartKey: "tiktok" as const,
    accent: "#1f5d3a",
    tint: "#ecf4ef",
    badge: "TT",
  },
  Facebook: {
    chartKey: "facebook" as const,
    accent: "#1d4ed8",
    tint: "#e9f0ff",
    badge: "FB",
  },
} as const;

type PlatformName = keyof typeof PLATFORM_META;

const formatShortViewers = (value: number) =>
  new Intl.NumberFormat("es-BO", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const getSnapshotTime = () =>
  new Date().toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export default function Home() {
  const [tiktokUsers, setTiktokUsers] = useState<User[]>([]);
  const [youtubeUsers, setYoutubeUsers] = useState<User[]>([]);
  const [facebookUsers, setFacebookUsers] = useState<User[]>([]);
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [chartChannelNames, setChartChannelNames] = useState<Record<string, string[]>>({
    youtube: [],
    tiktok: [],
    facebook: [],
  });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const unifiedEventSourceRef = useRef<EventSource | null>(null);
  const unifiedReconnectTimeoutRef = useRef<number | null>(null);

  const withTimeout = useCallback(<T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error(`Timeout de ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          window.clearTimeout(timer);
          reject(err);
        });
    });
  }, []);

  const normalizeUser = useCallback((value: unknown): User | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as Record<string, unknown>;

    const username =
      typeof candidate.username === "string"
        ? candidate.username
        : typeof candidate.channelTitle === "string"
        ? candidate.channelTitle
        : typeof candidate.title === "string"
        ? candidate.title
        : typeof candidate.videoId === "string"
        ? candidate.videoId
        : null;

    const viewerCount =
      typeof candidate.viewerCount === "number"
        ? candidate.viewerCount
        : typeof candidate.concurrentViewers === "number"
        ? candidate.concurrentViewers
        : null;

    if (username === null || viewerCount === null) {
      return null;
    }

    return {
      username,
      viewerCount,
      isLive: typeof candidate.isLive === "boolean" ? candidate.isLive : undefined,
    };
  }, []);

  const normalizeUsers = useCallback((payload: unknown): User[] => {
    if (Array.isArray(payload)) {
      return payload
        .map((value) => normalizeUser(value))
        .filter((user): user is User => user !== null);
    }

    if (payload && typeof payload === "object") {
      return Object.values(payload as Record<string, unknown>)
        .map((value) => normalizeUser(value))
        .filter((user): user is User => user !== null);
    }

    return [];
  }, [normalizeUser]);

  const upsertUser = useCallback((prev: User[], user: User): User[] => {
    const index = prev.findIndex((item) => item.username === user.username);
    if (index === -1) {
      return [user, ...prev];
    }

    const next = [...prev];
    next[index] = user;
    return next;
  }, []);

  const applySsePayload = useCallback(
    (payload: unknown, setUsers: React.Dispatch<React.SetStateAction<User[]>>) => {
      // Acepta snapshot completo de lista
      if (Array.isArray(payload)) {
        setUsers(normalizeUsers(payload));
        return;
      }

      // Acepta payload con data: []
      if (
        payload &&
        typeof payload === "object" &&
        "data" in payload &&
        Array.isArray((payload as { data: unknown }).data)
      ) {
        setUsers(normalizeUsers((payload as { data: unknown }).data));
        return;
      }

      // Acepta actualización puntual de usuario
      const directUser = normalizeUser(payload);
      if (directUser) {
        setUsers((prev) => upsertUser(prev, directUser));
        return;
      }

      // Acepta payload con data: { username, viewerCount }
      if (payload && typeof payload === "object" && "data" in payload) {
        const nestedUser = normalizeUser((payload as { data: unknown }).data);
        if (nestedUser) {
          setUsers((prev) => upsertUser(prev, nestedUser));
        }
      }
    },
    [normalizeUser, normalizeUsers, upsertUser]
  );

  const fetchPlatformUsers = useCallback(
    async (url: string): Promise<User[]> => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Error al cargar ${url}`);
      }
      const data = await res.json();
      return normalizeUsers(data.data);
    },
    [normalizeUsers]
  );

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);

    try {
      const [tiktokResult, youtubeResult, facebookResult] = await Promise.allSettled([
        withTimeout(fetchPlatformUsers(API_ENDPOINTS.TIKTOK_CACHE), 8000),
        withTimeout(fetchPlatformUsers(API_ENDPOINTS.YOUTUBE_CACHE), 8000),
        withTimeout(fetchPlatformUsers(API_ENDPOINTS.FACEBOOK_CACHE), 8000),
      ]);

      if (tiktokResult.status === "fulfilled") {
        setTiktokUsers(tiktokResult.value);
      }

      if (youtubeResult.status === "fulfilled") {
        setYoutubeUsers(youtubeResult.value);
      }

      if (facebookResult.status === "fulfilled") {
        setFacebookUsers(facebookResult.value);
      }

      if (tiktokResult.status === "rejected" || youtubeResult.status === "rejected" || facebookResult.status === "rejected") {
        console.warn("Fallo parcial en carga inicial (se mantiene con SSE):", {
          tiktok: tiktokResult,
          youtube: youtubeResult,
          facebook: facebookResult,
        });
      }

      // Evita falsos positivos: si hay SSE activo o carga parcial, no mostrar error global
      setError(null);
    } catch (err) {
      console.error("Error general en carga inicial:", err);
      setError(null);
    } finally {
      // Evita que el loader quede bloqueado si alguna petición no responde
      setDashboardLoading(false);
    }
  }, [fetchPlatformUsers, withTimeout]);

  const connectUnifiedStream = useCallback(
    function connectUnifiedStreamInternal() {
      try {
        if (unifiedEventSourceRef.current) {
          unifiedEventSourceRef.current.close();
        }

        const eventSource = new EventSource(API_ENDPOINTS.ALL_CACHE_STREAM);
        unifiedEventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "all_viewers_update" && payload.data) {
              if (Array.isArray(payload.data.tiktok)) {
                setTiktokUsers(normalizeUsers(payload.data.tiktok));
              }
              if (Array.isArray(payload.data.youtube)) {
                setYoutubeUsers(normalizeUsers(payload.data.youtube));
              }
              if (Array.isArray(payload.data.facebook)) {
                setFacebookUsers(normalizeUsers(payload.data.facebook));
              }
            } else {
              applySsePayload(payload, setTiktokUsers);
            }
          } catch (err) {
            console.error(`Error procesando SSE:`, err);
          }
        };

        eventSource.onerror = (error) => {
          console.error(`Error en SSE unificado:`, error);
          eventSource.close();
          unifiedEventSourceRef.current = null;

          if (unifiedReconnectTimeoutRef.current !== null) {
            window.clearTimeout(unifiedReconnectTimeoutRef.current);
          }

          unifiedReconnectTimeoutRef.current = window.setTimeout(() => {
            console.log(`Intentando reconectar SSE unificado...`);
            connectUnifiedStreamInternal();
          }, 5000);
        };
      } catch (err) {
        console.error(`Error al conectar SSE unificado:`, err);
      }
    },
    [normalizeUsers, applySsePayload]
  );

  const evolveMockUsers = useCallback((users: User[], min = 80, max = 260): User[] => {
    return users.map((user) => {
      const direction = Math.random() > 0.4 ? 1 : -1;
      const delta = Math.floor(Math.random() * (max - min + 1)) + min;
      const nextViewerCount = Math.max(100, user.viewerCount + direction * delta);

      return {
        ...user,
        viewerCount: nextViewerCount,
      };
    });
  }, []);

  // Cargar dashboard inicial y conectar SSE para ambas plataformas
  useEffect(() => {
    if (USE_MOCK_DATA) {
      setDashboardLoading(true);

      const bootTimeout = window.setTimeout(() => {
        setTiktokUsers(MOCK_TIKTOK_USERS);
        setYoutubeUsers(MOCK_YOUTUBE_USERS);
        setFacebookUsers(MOCK_FACEBOOK_USERS);
        setError(null);
        setDashboardLoading(false);
      }, 850);

      const mockTicker = window.setInterval(() => {
        setTiktokUsers((prev) => evolveMockUsers(prev));
        setYoutubeUsers((prev) => evolveMockUsers(prev));
        setFacebookUsers((prev) => evolveMockUsers(prev));
      }, 3800);

      return () => {
        window.clearTimeout(bootTimeout);
        window.clearInterval(mockTicker);
      };
    }

    loadDashboard();
    connectUnifiedStream();

    const unifiedTimeout = unifiedReconnectTimeoutRef;
    const unifiedSource = unifiedEventSourceRef;

    // Cleanup: cerrar SSE al desmontar
    return () => {
      if (unifiedTimeout.current !== null) {
        window.clearTimeout(unifiedTimeout.current);
      }
      if (unifiedSource.current) {
        unifiedSource.current.close();
      }
    };
  }, [connectUnifiedStream, evolveMockUsers, loadDashboard]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.HISTORY_AVERAGES}?windowMinutes=60`);
      if (!res.ok) throw new Error("Error fetching history averages");
      const json = await res.json();
      
      if (json.success && json.data && Array.isArray(json.data.data)) {
        const historyData = json.data.data;
        const pointsByMinute: Record<string, ChartPoint & { _timestamp: number }> = {};
        const channelsByPlatform: Record<string, Set<string>> = {
          youtube: new Set(),
          tiktok: new Set(),
          facebook: new Set(),
        };
        
        historyData.forEach((item: any) => {
          const minISO = item.minute;
          const timestamp = new Date(minISO).getTime();
          const displayTime = new Date(minISO).toLocaleTimeString("es-BO", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          
          if (!pointsByMinute[minISO]) {
            pointsByMinute[minISO] = { 
              time: displayTime, 
              tiktok: 0, 
              youtube: 0, 
              facebook: 0,
              _timestamp: timestamp
            };
          }
          
          const plat: string = item.platform ?? "";
          if (plat && channelsByPlatform[plat]) {
            (item.channelNames as string[] ?? []).forEach((ch: string) => channelsByPlatform[plat].add(ch));
          }

          if (plat === "tiktok") {
            pointsByMinute[minISO].tiktok += item.averageViewCount;
          } else if (plat === "youtube") {
            pointsByMinute[minISO].youtube += item.averageViewCount;
          } else if (plat === "facebook") {
            pointsByMinute[minISO].facebook += item.averageViewCount;
          }
        });
        
        const sortedPoints = Object.values(pointsByMinute)
          .sort((a, b) => a._timestamp - b._timestamp)
          .map(({ _timestamp, ...rest }) => rest);
          
        setChartHistory(sortedPoints);
        setChartChannelNames({
          youtube: Array.from(channelsByPlatform.youtube),
          tiktok: Array.from(channelsByPlatform.tiktok),
          facebook: Array.from(channelsByPlatform.facebook),
        });
      }
    } catch (err) {
      console.error("Error cargando historiograma:", err);
    }
  }, []);

  useEffect(() => {
    if (USE_MOCK_DATA) {
      // Generate some fake history points for demo mode
      const mockHistory: ChartPoint[] = [];
      const now = Date.now();
      for (let i = 20; i >= 0; i--) {
        const time = new Date(now - i * 3 * 60000).toLocaleTimeString("es-BO", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        mockHistory.push({
          time,
          tiktok: Math.floor(5000 + Math.random() * 2000),
          youtube: Math.floor(7000 + Math.random() * 3000),
          facebook: Math.floor(4000 + Math.random() * 1500),
        });
      }
      setChartHistory(mockHistory);
      setChartChannelNames({
        youtube: ["ElDeberTV", "BoliviaLiveNews"],
        tiktok: ["deber_tv_bo", "noticias.scz"],
        facebook: ["ElDeberNoticias"],
      });
      return;
    }

    // Fetch initial history immediately
    fetchHistory();
    
    // Refresh history from API every 1 minute
    const interval = window.setInterval(fetchHistory, 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchHistory]);

  const allStreams: StreamCardUser[] = [
    ...tiktokUsers.map((user) => ({ ...user, platform: "TikTok" as const })),
    ...youtubeUsers.map((user) => ({ ...user, platform: "YouTube" as const })),
    ...facebookUsers.map((user) => ({ ...user, platform: "Facebook" as const })),
  ].sort((a, b) => b.viewerCount - a.viewerCount);

  const sortedYoutubeStreams = [...youtubeUsers].sort((a, b) => b.viewerCount - a.viewerCount);
  const sortedTiktokStreams = [...tiktokUsers].sort((a, b) => b.viewerCount - a.viewerCount);
  const sortedFacebookStreams = [...facebookUsers].sort((a, b) => b.viewerCount - a.viewerCount);

  // Combine all active channel names from across the platforms into a single global title
  const activeChannelNamesGlobal = Array.from(
    new Set([
      ...(chartChannelNames.youtube ?? []),
      ...(chartChannelNames.tiktok ?? []),
      ...(chartChannelNames.facebook ?? []),
    ])
  );
  const globalTitle = activeChannelNamesGlobal.length > 0 ? activeChannelNamesGlobal.join(", ") : "Visualizador de Transmisiones";

  const topViewerCount = allStreams[0]?.viewerCount ?? 0;
  const totalLiveViewers = allStreams.reduce((sum, stream) => sum + stream.viewerCount, 0);
  const latestSnapshot = chartHistory[chartHistory.length - 1]?.time ?? getSnapshotTime();
  const chartPlatforms: PlatformName[] = ["YouTube", "TikTok", "Facebook"];

  const platformSummaries = {
    YouTube: {
      users: sortedYoutubeStreams,
      total: youtubeUsers.reduce((sum, user) => sum + user.viewerCount, 0),
    },
    TikTok: {
      users: sortedTiktokStreams,
      total: tiktokUsers.reduce((sum, user) => sum + user.viewerCount, 0),
    },
    Facebook: {
      users: sortedFacebookStreams,
      total: facebookUsers.reduce((sum, user) => sum + user.viewerCount, 0),
    },
  } satisfies Record<PlatformName, { users: User[]; total: number }>;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fbf9_0%,#eef3ef_52%,#e4ece7_100%)] py-6 md:py-10">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 px-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-2xl bg-white/85 p-5 shadow-[0_18px_38px_-28px_rgba(31,93,58,0.7)] backdrop-blur">
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Monitoreo</p>
            <h2 className="mt-3 border-l-4 border-primary pl-3 font-serif text-2xl leading-tight text-primary">
              {globalTitle}
            </h2>
            <p className="mt-4 font-sans text-sm text-gray-600">Cobertura continua de transmisiones en vivo.</p>
            <div className="mt-6 space-y-3 font-sans text-sm text-gray-700">
              <div className="rounded-xl bg-[#f4f8f5] px-3 py-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">Streams activos</p>
                <p className="mt-1 text-2xl font-semibold text-primary">{allStreams.length}</p>
              </div>
              <div className="rounded-xl bg-[#f4f8f5] px-3 py-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">Viewers totales</p>
                <p className="mt-1 text-2xl font-semibold text-primary">
                  {totalLiveViewers.toLocaleString("es-ES")}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <header className="rounded-2xl bg-white px-5 py-6 shadow-[0_20px_40px_-30px_rgba(31,93,58,0.8)] md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-sans text-xs uppercase tracking-[0.24em] text-gray-500">Dashboard de monitoreo</p>
                <h1 className="mt-3 border-l-4 border-primary pl-4 font-serif text-3xl text-primary md:text-4xl">
                  Portada en Vivo
                </h1>
                <p className="mt-3 font-sans text-sm text-gray-600">
                  {globalTitle} - {latestSnapshot} - {totalLiveViewers.toLocaleString("es-ES")} views en vivo
                </p>
              </div>
              <div className="rounded-full bg-[#ecf4ef] px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-primary">
                Actualizacion continua
              </div>
            </div>
          </header>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {chartPlatforms.map((platformName) => {
              const platform = PLATFORM_META[platformName];
              const summary = platformSummaries[platformName];

              return (
                <article
                  key={platformName}
                  className="rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6"
                >
                  <div className="mb-4 flex items-end justify-between gap-4">
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
                      {/* Channel names from API */}
                      {(() => {
                        const channels = chartChannelNames[platform.chartKey] ?? [];
                        if (channels.length === 0) return null;
                        return (
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
                        );
                      })()}
                    </div>
                    <div className="text-right">
                      <p className="font-sans text-sm text-gray-500">Ultima toma: {latestSnapshot}</p>
                      <p className="mt-1 font-sans text-xs uppercase tracking-[0.18em] text-gray-400">
                        {summary.total.toLocaleString("es-ES")} viewers totales
                      </p>
                    </div>
                  </div>

                  {dashboardLoading ? (
                    <div className="h-[230px] animate-pulse rounded-xl bg-gradient-to-b from-[#f4f7f5] to-[#ebf0ed]" />
                  ) : chartHistory.length > 0 ? (
                    <div className="h-[230px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartHistory} margin={{ top: 8, right: 20, left: 4, bottom: 8 }}>
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
                            formatter={(value) => {
                              const channels = chartChannelNames[platform.chartKey] ?? [];
                              const labelName = channels.length > 0 ? channels.join(", ") : platformName;
                              return [`${Number(value ?? 0).toLocaleString("es-ES")} views`, labelName];
                            }}
                            labelFormatter={(label, payload) => {
                              const sample = payload && payload.length ? payload[0].payload : null;
                              const total = sample ? sample[platform.chartKey] : 0;
                              return `${label} - ${Number(total ?? 0).toLocaleString("es-ES")} views`;
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey={platform.chartKey}
                            stroke={platform.accent}
                            strokeWidth={3}
                            dot={{ r: 3 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c8d6ce] bg-[#f8fbf9] px-4 text-center">
                      <p className="font-serif text-2xl text-primary">Esperando datos de {platformName}</p>
                      <p className="mt-2 font-sans text-sm text-gray-600">
                        El historiograma aparecera automaticamente cuando lleguen transmisiones en vivo.
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <section className="rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Lista vertical</p>
                <h2 className="mt-2 font-serif text-2xl text-primary md:text-3xl">Transmisiones activas</h2>
              </div>
              <p className="font-sans text-sm text-gray-500">Actualizacion en tiempo real por SSE</p>
            </div>

            {dashboardLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-28 animate-pulse rounded-2xl bg-gradient-to-r from-[#f4f7f5] via-[#eef3ef] to-[#f4f7f5]"
                  />
                ))}
              </div>
            ) : allStreams.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:gap-5">
                <div className="rounded-xl border border-[#e3ebe5] bg-[#fcfdfc] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-[#f6faf7] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fdeced] text-xs font-bold text-[#b91c1c]">
                        YT
                      </div>
                      <h3 className="font-serif text-xl text-primary md:text-2xl">YouTube</h3>
                    </div>
                    <p className="font-sans text-xs uppercase tracking-widest text-gray-500">
                      {sortedYoutubeStreams.length} en vivo
                    </p>
                  </div>

                  {sortedYoutubeStreams.length > 0 ? (
                    <div className="space-y-3">
                      {sortedYoutubeStreams.map((user) => (
                        <UserCard
                          key={`youtube-${user.username}`}
                          username={user.username}
                          viewerCount={user.viewerCount}
                          platform="YouTube"
                          isTrending={user.viewerCount === topViewerCount && topViewerCount > 0}
                          metadata={`Actualizado ${latestSnapshot}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#d8e2dc] bg-[#fafcfa] px-4 py-8 text-center">
                      <p className="font-sans text-sm text-gray-500">No hay transmisiones activas en YouTube.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#e3ebe5] bg-[#fcfdfc] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-[#f6faf7] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e9f0ff] text-xs font-bold text-[#1d4ed8]">
                        FB
                      </div>
                      <h3 className="font-serif text-xl text-primary md:text-2xl">Facebook</h3>
                    </div>
                    <p className="font-sans text-xs uppercase tracking-widest text-gray-500">
                      {sortedFacebookStreams.length} en vivo
                    </p>
                  </div>

                  {sortedFacebookStreams.length > 0 ? (
                    <div className="space-y-3">
                      {sortedFacebookStreams.map((user) => (
                        <UserCard
                          key={`facebook-${user.username}`}
                          username={user.username}
                          viewerCount={user.viewerCount}
                          platform="Facebook"
                          isTrending={user.viewerCount === topViewerCount && topViewerCount > 0}
                          metadata={`Actualizado ${latestSnapshot}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#d8e2dc] bg-[#fafcfa] px-4 py-8 text-center">
                      <p className="font-sans text-sm text-gray-500">No hay transmisiones activas en Facebook.</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#e3ebe5] bg-[#fcfdfc] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-[#f6faf7] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ecf4ef] text-xs font-bold text-primary">
                        TT
                      </div>
                      <h3 className="font-serif text-xl text-primary md:text-2xl">TikTok</h3>
                    </div>
                    <p className="font-sans text-xs uppercase tracking-widest text-gray-500">
                      {sortedTiktokStreams.length} en vivo
                    </p>
                  </div>

                  {sortedTiktokStreams.length > 0 ? (
                    <div className="space-y-3">
                      {sortedTiktokStreams.map((user) => (
                        <UserCard
                          key={`tiktok-${user.username}`}
                          username={user.username}
                          viewerCount={user.viewerCount}
                          platform="TikTok"
                          isTrending={user.viewerCount === topViewerCount && topViewerCount > 0}
                          metadata={`Actualizado ${latestSnapshot}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-[#d8e2dc] bg-[#fafcfa] px-4 py-8 text-center">
                      <p className="font-sans text-sm text-gray-500">No hay transmisiones activas en TikTok.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#c8d6ce] bg-[#f8fbf9] px-4 py-16 text-center">
                <p className="font-serif text-3xl text-primary">Sin transmisiones activas</p>
                <p className="mt-3 max-w-xl font-sans text-sm text-gray-600">
                  Cuando TikTok o YouTube reporten eventos live, el feed vertical mostrara cada stream con su contador.
                </p>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
