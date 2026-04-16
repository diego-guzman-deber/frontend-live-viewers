import { useCallback, useEffect, useRef, useState } from "react";
import UserCard from "../components/UserCard";
import { API_ENDPOINTS } from "../config";
import {
  CartesianGrid,
  Legend,
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
}

interface StreamCardUser extends User {
  platform: "TikTok" | "YouTube";
}

const USE_MOCK_DATA = true;

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
  const [chartHistory, setChartHistory] = useState<ChartPoint[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tiktokEventSourceRef = useRef<EventSource | null>(null);
  const youtubeEventSourceRef = useRef<EventSource | null>(null);
  const tiktokReconnectTimeoutRef = useRef<number | null>(null);
  const youtubeReconnectTimeoutRef = useRef<number | null>(null);

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
      const [tiktokResult, youtubeResult] = await Promise.allSettled([
        withTimeout(fetchPlatformUsers(API_ENDPOINTS.TIKTOK_CACHE), 8000),
        withTimeout(fetchPlatformUsers(API_ENDPOINTS.YOUTUBE_CACHE), 8000),
      ]);

      if (tiktokResult.status === "fulfilled") {
        setTiktokUsers(tiktokResult.value);
      }

      if (youtubeResult.status === "fulfilled") {
        setYoutubeUsers(youtubeResult.value);
      }

      if (tiktokResult.status === "rejected" || youtubeResult.status === "rejected") {
        console.warn("Fallo parcial en carga inicial (se mantiene con SSE):", {
          tiktok: tiktokResult,
          youtube: youtubeResult,
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

  const connectStream = useCallback(
    function connectStreamInternal(
      streamUrl: string,
      eventSourceRef: React.MutableRefObject<EventSource | null>,
      reconnectRef: React.MutableRefObject<number | null>,
      setUsers: React.Dispatch<React.SetStateAction<User[]>>,
      label: string
    ) {
    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(streamUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          applySsePayload(payload, setUsers);
        } catch (err) {
          console.error(`Error procesando SSE (${label}):`, err);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`Error en SSE (${label}):`, error);
        eventSource.close();
        eventSourceRef.current = null;

        if (reconnectRef.current !== null) {
          window.clearTimeout(reconnectRef.current);
        }

        // Reconectar automáticamente después de 5 segundos
        reconnectRef.current = window.setTimeout(() => {
          console.log(`Intentando reconectar SSE (${label})...`);
          connectStreamInternal(streamUrl, eventSourceRef, reconnectRef, setUsers, label);
        }, 5000);
      };
    } catch (err) {
      console.error(`Error al conectar SSE (${label}):`, err);
    }
  },
    [applySsePayload]
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
        setError(null);
        setDashboardLoading(false);
      }, 850);

      const mockTicker = window.setInterval(() => {
        setTiktokUsers((prev) => evolveMockUsers(prev));
        setYoutubeUsers((prev) => evolveMockUsers(prev));
      }, 3800);

      return () => {
        window.clearTimeout(bootTimeout);
        window.clearInterval(mockTicker);
      };
    }

    loadDashboard();
    connectStream(
      API_ENDPOINTS.TIKTOK_CACHE_STREAM,
      tiktokEventSourceRef,
      tiktokReconnectTimeoutRef,
      setTiktokUsers,
      "TikTok"
    );
    connectStream(
      API_ENDPOINTS.YOUTUBE_CACHE_STREAM,
      youtubeEventSourceRef,
      youtubeReconnectTimeoutRef,
      setYoutubeUsers,
      "YouTube"
    );

    const tiktokTimeout = tiktokReconnectTimeoutRef;
    const youtubeTimeout = youtubeReconnectTimeoutRef;
    const tiktokSource = tiktokEventSourceRef;
    const youtubeSource = youtubeEventSourceRef;

    // Cleanup: cerrar SSE al desmontar
    return () => {
      if (tiktokTimeout.current !== null) {
        window.clearTimeout(tiktokTimeout.current);
      }
      if (youtubeTimeout.current !== null) {
        window.clearTimeout(youtubeTimeout.current);
      }
      if (tiktokSource.current) {
        tiktokSource.current.close();
      }
      if (youtubeSource.current) {
        youtubeSource.current.close();
      }
    };
  }, [connectStream, evolveMockUsers, loadDashboard]);

  useEffect(() => {
    const tiktokTotal = tiktokUsers.reduce((sum, user) => sum + user.viewerCount, 0);
    const youtubeTotal = youtubeUsers.reduce((sum, user) => sum + user.viewerCount, 0);

    const nextPoint: ChartPoint = {
      time: getSnapshotTime(),
      tiktok: tiktokTotal,
      youtube: youtubeTotal,
    };

    setChartHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.tiktok === nextPoint.tiktok && last.youtube === nextPoint.youtube) {
        return prev;
      }

      return [...prev, nextPoint].slice(-16);
    });
  }, [tiktokUsers, youtubeUsers]);

  const allStreams: StreamCardUser[] = [
    ...tiktokUsers.map((user) => ({ ...user, platform: "TikTok" as const })),
    ...youtubeUsers.map((user) => ({ ...user, platform: "YouTube" as const })),
  ].sort((a, b) => b.viewerCount - a.viewerCount);

  const sortedYoutubeStreams = [...youtubeUsers].sort((a, b) => b.viewerCount - a.viewerCount);
  const sortedTiktokStreams = [...tiktokUsers].sort((a, b) => b.viewerCount - a.viewerCount);

  const topViewerCount = allStreams[0]?.viewerCount ?? 0;
  const totalLiveViewers = allStreams.reduce((sum, stream) => sum + stream.viewerCount, 0);
  const latestSnapshot = chartHistory[chartHistory.length - 1]?.time ?? getSnapshotTime();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fbf9_0%,#eef3ef_52%,#e4ece7_100%)] py-6 md:py-10">
      <div className="mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-6 px-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-6 rounded-2xl bg-white/85 p-5 shadow-[0_18px_38px_-28px_rgba(31,93,58,0.7)] backdrop-blur">
            <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Monitoreo</p>
            <h2 className="mt-3 border-l-4 border-primary pl-3 font-serif text-2xl leading-tight text-primary">
              EL DEBER
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
                  EL DEBER - {latestSnapshot} - {totalLiveViewers.toLocaleString("es-ES")} views en vivo
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

          <article className="rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="font-sans text-xs uppercase tracking-[0.2em] text-gray-500">Historiograma</p>
                <h2 className="mt-2 font-serif text-2xl text-primary md:text-3xl">Evolucion de viewers en vivo</h2>
              </div>
              <p className="font-sans text-sm text-gray-500">Ultima toma: {latestSnapshot}</p>
            </div>

            {dashboardLoading ? (
              <div className="h-[300px] animate-pulse rounded-xl bg-gradient-to-b from-[#f4f7f5] to-[#ebf0ed]" />
            ) : chartHistory.length > 0 ? (
              <div className="h-[300px] w-full">
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
                      cursor={{ stroke: "#1f5d3a", strokeDasharray: "2 4" }}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #d7e2db",
                        borderRadius: "12px",
                      }}
                      labelStyle={{ color: "#1f5d3a", fontWeight: 600 }}
                      formatter={(value, name) => {
                        const numericValue = Number(value ?? 0);
                        const platformLabel = name === "tiktok" ? "TikTok" : "YouTube";
                        return [`${numericValue.toLocaleString("es-ES")} views`, platformLabel];
                      }}
                      labelFormatter={(label, payload) => {
                        const sample = payload && payload.length ? payload[0].payload : null;
                        const total = sample ? sample.tiktok + sample.youtube : 0;
                        return `${label} - ${total.toLocaleString("es-ES")} views`;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "13px", color: "#4a5b51" }}
                      formatter={(value: string) => (value === "tiktok" ? "TikTok" : "YouTube")}
                    />
                    <Line
                      type="monotone"
                      dataKey="tiktok"
                      stroke="#1f5d3a"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="youtube"
                      stroke="#b91c1c"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-[#c8d6ce] bg-[#f8fbf9] px-4 text-center">
                <p className="font-serif text-2xl text-primary">Esperando datos de viewers</p>
                <p className="mt-2 font-sans text-sm text-gray-600">
                  El historiograma aparecera automaticamente cuando lleguen transmisiones en vivo.
                </p>
              </div>
            )}
          </article>

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
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-5">
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
