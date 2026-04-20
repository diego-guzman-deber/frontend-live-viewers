import { useCallback, useEffect, useRef, useState } from "react";
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
  _timestamp: number;
  [key: string]: string | number;
}

interface ChannelSeries {
  key: string;
  channel: string;
  color: string;
  dashArray: string;
}

interface StreamCardUser extends User {
  platform: "TikTok" | "YouTube" | "Facebook";
}

const USE_MOCK_DATA = false;

const PLATFORM_META = {
  YouTube: {
    chartKey: "youtube" as const,
    accent: "#b91c1c",
    tint: "#fdeced",
    badge: "YT",
    lineColors: ["#b91c1c", "#1d4ed8", "#d97706", "#7c3aed"],
  },
  TikTok: {
    chartKey: "tiktok" as const,
    accent: "#1f5d3a",
    tint: "#ecf4ef",
    badge: "TT",
    lineColors: ["#166534", "#0ea5e9", "#ea580c", "#9333ea"],
  },
  Facebook: {
    chartKey: "facebook" as const,
    accent: "#1d4ed8",
    tint: "#e9f0ff",
    badge: "FB",
    lineColors: ["#1d4ed8", "#16a34a", "#dc2626", "#d97706"],
  },
} as const;

const SERIES_DASH_PATTERNS = ["0", "7 4", "3 3", "10 4"];
const MAX_CHART_POINTS = 14;
const BRAND_CHANNEL_COLORS = {
  redUno: "#f97316",
  unitel: "#dc2626",
  elDeber: "#16a34a",
} as const;

type PlatformName = keyof typeof PLATFORM_META;
type ChartPlatformKey = (typeof PLATFORM_META)[PlatformName]["chartKey"];

const PLATFORM_NAME_BY_KEY: Record<ChartPlatformKey, PlatformName> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
};

const CHART_PLATFORM_KEYS: ChartPlatformKey[] = ["youtube", "tiktok", "facebook"];

const buildDisplayTime = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const slugifyChannel = (channel: string) => {
  const slug = channel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "canal";
};

const normalizeChannelName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const getChannelLineColor = (channelName: string, fallbackColor: string) => {
  const normalized = normalizeChannelName(channelName);

  if (normalized.includes("reduno") || normalized.includes("redunotv")) {
    return BRAND_CHANNEL_COLORS.redUno;
  }

  if (normalized.includes("unitel")) {
    return BRAND_CHANNEL_COLORS.unitel;
  }

  if (normalized.includes("eldeber") || normalized.includes("deber")) {
    return BRAND_CHANNEL_COLORS.elDeber;
  }

  return fallbackColor;
};

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

const toSnapshotTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export default function Home() {
  const [tiktokUsers, setTiktokUsers] = useState<User[]>([]);
  const [youtubeUsers, setYoutubeUsers] = useState<User[]>([]);
  const [facebookUsers, setFacebookUsers] = useState<User[]>([]);
  const [chartHistoryByPlatform, setChartHistoryByPlatform] = useState<Record<ChartPlatformKey, ChartPoint[]>>({
    youtube: [],
    tiktok: [],
    facebook: [],
  });
  const [chartSeriesByPlatform, setChartSeriesByPlatform] = useState<Record<ChartPlatformKey, ChannelSeries[]>>({
    youtube: [],
    tiktok: [],
    facebook: [],
  });
  const [latestHistoryTimestamp, setLatestHistoryTimestamp] = useState<number | null>(null);
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

  const syncChartSnapshot = useCallback(
    (liveUsers: Partial<Record<ChartPlatformKey, User[]>>, snapshotTimestamp = Date.now()) => {
      const snapshotTime = toSnapshotTime(snapshotTimestamp);

      setChartSeriesByPlatform((prev) => {
        const next = { ...prev };

        CHART_PLATFORM_KEYS.forEach((platform) => {
          const users = liveUsers[platform];
          if (!Array.isArray(users) || users.length === 0) {
            return;
          }

          const platformName = PLATFORM_NAME_BY_KEY[platform];
          const colors = PLATFORM_META[platformName].lineColors;
          const sortedUsers = [...users].sort((a, b) => b.viewerCount - a.viewerCount);

          next[platform] = sortedUsers.map((user, index) => ({
            key: `ch_${slugifyChannel(user.username)}`,
            channel: user.username,
            color: getChannelLineColor(user.username, colors[index % colors.length]),
            dashArray: SERIES_DASH_PATTERNS[index % SERIES_DASH_PATTERNS.length],
          }));
        });

        return next;
      });

      setChartChannelNames((prev) => {
        const next = { ...prev };

        CHART_PLATFORM_KEYS.forEach((platform) => {
          const users = liveUsers[platform];
          if (!Array.isArray(users) || users.length === 0) {
            return;
          }

          next[platform] = [...users]
            .sort((a, b) => b.viewerCount - a.viewerCount)
            .map((user) => user.username);
        });

        return next;
      });

      setChartHistoryByPlatform((prev) => {
        const next = { ...prev };

        CHART_PLATFORM_KEYS.forEach((platform) => {
          const users = liveUsers[platform];
          if (!Array.isArray(users) || users.length === 0) {
            return;
          }

          const sortedUsers = [...users].sort((a, b) => b.viewerCount - a.viewerCount);
          const point: ChartPoint = {
            time: snapshotTime,
            _timestamp: snapshotTimestamp,
          };

          sortedUsers.forEach((user) => {
            point[`ch_${slugifyChannel(user.username)}`] = user.viewerCount;
          });

          next[platform] = [...(prev[platform] ?? []), point].slice(-MAX_CHART_POINTS);
        });

        return next;
      });

      setLatestHistoryTimestamp(snapshotTimestamp);
    },
    []
  );

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

      syncChartSnapshot({
        tiktok: tiktokResult.status === "fulfilled" ? tiktokResult.value : undefined,
        youtube: youtubeResult.status === "fulfilled" ? youtubeResult.value : undefined,
        facebook: facebookResult.status === "fulfilled" ? facebookResult.value : undefined,
      });

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
  }, [fetchPlatformUsers, syncChartSnapshot, withTimeout]);

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
              syncChartSnapshot(
                {
                  tiktok: Array.isArray(payload.data.tiktok) ? normalizeUsers(payload.data.tiktok) : undefined,
                  youtube: Array.isArray(payload.data.youtube) ? normalizeUsers(payload.data.youtube) : undefined,
                  facebook: Array.isArray(payload.data.facebook) ? normalizeUsers(payload.data.facebook) : undefined,
                },
                typeof payload.data.updatedAt === "string" ? new Date(payload.data.updatedAt).getTime() : Date.now()
              );
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
    [normalizeUsers, applySsePayload, syncChartSnapshot]
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

  useEffect(() => {
    if (USE_MOCK_DATA) {
      // Generate fake per-platform history points for demo mode
      const mockHistoryByPlatform: Record<ChartPlatformKey, ChartPoint[]> = {
        youtube: [],
        tiktok: [],
        facebook: [],
      };
      const now = Date.now();

      for (let i = 20; i >= 0; i--) {
        const timestamp = now - i * 3 * 60000;
        const time = buildDisplayTime(new Date(timestamp).toISOString());

        mockHistoryByPlatform.tiktok.push({
          time,
          _timestamp: timestamp,
          ch_redunotv: Math.floor(1600 + Math.random() * 600),
          ch_unitel_bo: Math.floor(500 + Math.random() * 280),
          ch_el_deber: Math.floor(700 + Math.random() * 450),
        });

        mockHistoryByPlatform.youtube.push({
          time,
          _timestamp: timestamp,
          ch_unitel_bolivia: Math.floor(1200 + Math.random() * 520),
          ch_red_uno_de_bolivia: Math.floor(800 + Math.random() * 420),
        });

        mockHistoryByPlatform.facebook.push({
          time,
          _timestamp: timestamp,
          ch_el_deber_noticias: Math.floor(900 + Math.random() * 500),
        });
      }

      setChartHistoryByPlatform(mockHistoryByPlatform);
      setChartSeriesByPlatform({
        youtube: [
          {
            key: "ch_unitel_bolivia",
            channel: "Unitel Bolivia",
            color: getChannelLineColor("Unitel Bolivia", PLATFORM_META.YouTube.lineColors[0]),
            dashArray: SERIES_DASH_PATTERNS[0],
          },
          {
            key: "ch_red_uno_de_bolivia",
            channel: "Red Uno De Bolivia",
            color: getChannelLineColor("Red Uno De Bolivia", PLATFORM_META.YouTube.lineColors[1]),
            dashArray: SERIES_DASH_PATTERNS[1],
          },
        ],
        tiktok: [
          {
            key: "ch_redunotv",
            channel: "redunotv",
            color: getChannelLineColor("redunotv", PLATFORM_META.TikTok.lineColors[0]),
            dashArray: SERIES_DASH_PATTERNS[0],
          },
          {
            key: "ch_unitel_bo",
            channel: "unitel.bo",
            color: getChannelLineColor("unitel.bo", PLATFORM_META.TikTok.lineColors[1]),
            dashArray: SERIES_DASH_PATTERNS[1],
          },
          {
            key: "ch_el_deber",
            channel: "eldeber_tv_bo",
            color: getChannelLineColor("eldeber_tv_bo", PLATFORM_META.TikTok.lineColors[2]),
            dashArray: SERIES_DASH_PATTERNS[2],
          },
        ],
        facebook: [
          {
            key: "ch_el_deber_noticias",
            channel: "ElDeberNoticias",
            color: getChannelLineColor("ElDeberNoticias", PLATFORM_META.Facebook.lineColors[0]),
            dashArray: SERIES_DASH_PATTERNS[0],
          },
        ],
      });
      setChartChannelNames({
        youtube: ["ElDeberTV", "BoliviaLiveNews"],
        tiktok: ["redunotv", "unitel.bo", "eldeber_tv_bo"],
        facebook: ["ElDeberNoticias"],
      });
      setLatestHistoryTimestamp(now);
      return;
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

  const totalLiveViewers = allStreams.reduce((sum, stream) => sum + stream.viewerCount, 0);
  const latestSnapshot =
    latestHistoryTimestamp !== null
      ? buildDisplayTime(new Date(latestHistoryTimestamp).toISOString())
      : getSnapshotTime();

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

  const quadrantOrder: Array<PlatformName | "Imagenes"> = ["YouTube", "Imagenes", "TikTok", "Facebook"];

  return (
    <main className="bg-[radial-gradient(circle_at_top,#f8fbf9_0%,#eef3ef_52%,#e4ece7_100%)] px-4 py-4 md:px-6 md:py-6 lg:h-screen lg:overflow-hidden lg:px-8 lg:py-8">
      <div className="mx-auto flex h-full w-full max-w-[1650px] flex-col gap-4 md:gap-5 lg:gap-6">
        <header className="rounded-2xl bg-white px-5 py-5 shadow-[0_20px_40px_-30px_rgba(31,93,58,0.8)] md:px-7 md:py-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.24em] text-gray-500">Dashboard de monitoreo</p>
              <h1 className="mt-2 border-l-4 border-primary pl-4 font-serif text-3xl text-primary md:text-4xl">
                Portada en Vivo
              </h1>
              <p className="mt-2 font-sans text-sm text-gray-600">
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

        <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:overflow-hidden">
          {quadrantOrder.map((quadrant) => {
            if (quadrant === "Imagenes") {
              return (
                <article
                  key="Imagenes"
                  className="flex min-h-[320px] flex-col rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6"
                >
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

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {(["YouTube", "TikTok", "Facebook"] as PlatformName[]).map((platformName) => {
                      const platform = PLATFORM_META[platformName];
                      const summary = platformSummaries[platformName];

                      return (
                        <div key={platformName} className="rounded-xl border border-[#d9e2dc] bg-[#f8fbf9] p-3">
                          <p className="font-sans text-[11px] uppercase tracking-[0.14em] text-gray-500">{platformName}</p>
                          <p className="mt-2 font-sans text-2xl font-bold leading-none" style={{ color: platform.accent }}>
                            {summary.total.toLocaleString("es-ES")}
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

            const platformName = quadrant as PlatformName;
            const platform = PLATFORM_META[platformName];
            const summary = platformSummaries[platformName];
            const platformHistory = chartHistoryByPlatform[platform.chartKey] ?? [];
            const platformSeries = chartSeriesByPlatform[platform.chartKey] ?? [];
            const seriesNameByKey = new Map(platformSeries.map((series) => [series.key, series.channel]));

            return (
              <article
                key={platformName}
                className="flex min-h-[320px] flex-col rounded-2xl bg-white p-5 shadow-[0_22px_45px_-32px_rgba(31,93,58,0.85)] md:p-6"
              >
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
                      {summary.total.toLocaleString("es-ES")} viewers
                    </p>
                  </div>
                </div>

                {dashboardLoading ? (
                  <div className="h-[240px] animate-pulse rounded-xl bg-gradient-to-b from-[#f4f7f5] to-[#ebf0ed]" />
                ) : platformHistory.length > 0 && platformSeries.length > 0 ? (
                  <div className="h-[240px] w-full md:flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={platformHistory} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
                            const total = (payload ?? []).reduce(
                              (sum, item) => sum + Number(item?.value ?? 0),
                              0
                            );
                            return `${label} - ${Number(total ?? 0).toLocaleString("es-ES")} views`;
                          }}
                        />
                        {platformSeries.map((series) => (
                          <Line
                            key={`${platform.chartKey}-${series.key}`}
                            type="monotone"
                            dataKey={series.key}
                            stroke={series.color}
                            strokeWidth={2.8}
                            strokeDasharray={series.dashArray}
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
          })}
        </section>
      </div>
    </main>
  );
}
