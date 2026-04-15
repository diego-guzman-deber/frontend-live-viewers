import { useCallback, useEffect, useRef, useState } from "react";
import UserCard from "../components/UserCard";
import { API_ENDPOINTS } from "../config";

interface User {
  username: string;
  viewerCount: number;
  isLive?: boolean;
}

export default function Home() {
  const [tiktokUsers, setTiktokUsers] = useState<User[]>([]);
  const [youtubeUsers, setYoutubeUsers] = useState<User[]>([]);
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

  // Cargar dashboard inicial y conectar SSE para ambas plataformas
  useEffect(() => {
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
  }, [connectStream, loadDashboard]);

  return (
    <main className="bg-lightgray min-h-screen py-12 px-4">
      <section className="container mx-auto max-w-4xl">
        {/* Errores */}
        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded-md mb-6 text-center font-sans">
            {error}
          </div>
        )}

        {/* Portada de noticias */}
        <div className="border-t-4 border-primary pt-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-1 h-8 bg-primary"></div>
            <h1 className="font-serif text-4xl text-primary">PORTADA EN VIVO</h1>
          </div>
          <p className="font-sans text-gray-600 mb-8 text-sm tracking-widest">
            Últimas transmisiones en vivo
          </p>
        </div>

        {/* Fila TikTok */}
        {dashboardLoading ? (
          <div className="text-center py-12">
            <div className="inline-block">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
              <p className="text-gray-500 font-sans">Cargando transmisiones...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <h2 className="font-serif text-2xl text-primary mb-4">TIKTOK EN VIVO</h2>
              {tiktokUsers.length > 0 ? (
                <div className="flex gap-6 overflow-x-auto pb-2">
                  {tiktokUsers.map((user) => (
                    <div key={`tiktok-${user.username}`} className="min-w-[320px] flex-1">
                      <UserCard username={user.username} viewerCount={user.viewerCount} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-white rounded-lg">
                  <p className="text-gray-500 font-sans">No hay transmisiones de TikTok.</p>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-serif text-2xl text-primary mb-4">YOUTUBE EN VIVO</h2>
              {youtubeUsers.length > 0 ? (
                <div className="flex gap-6 overflow-x-auto pb-2">
                  {youtubeUsers.map((user) => (
                    <div key={`youtube-${user.username}`} className="min-w-[320px] flex-1">
                      <UserCard username={user.username} viewerCount={user.viewerCount} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-white rounded-lg">
                  <p className="text-gray-500 font-sans">No hay transmisiones de YouTube.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
