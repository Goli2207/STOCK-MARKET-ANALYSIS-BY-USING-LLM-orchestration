import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const WS_URL = "ws://localhost:3000";
const DEFAULT_SYMBOL = "NSE:TCS-EQ";
const THROTTLE_MS = 1000;
const WINDOW_SIZE = 30;

function normalizeSymbol(value) {
  return value.trim().toUpperCase();
}

export default function Fyers() {
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOL);
  const [activeSymbol, setActiveSymbol] = useState(DEFAULT_SYMBOL);
  const [connectionState, setConnectionState] = useState("Connecting...");
  const [errorText, setErrorText] = useState("");
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: `${DEFAULT_SYMBOL} Price`,
        data: [],
        borderColor: "#1d4ed8",
        backgroundColor: "rgba(29, 78, 216, 0.2)",
        tension: 0.25,
      },
    ],
  });

  const wsRef = useRef(null);
  const lastUpdateRef = useRef(0);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      animation: false,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        title: {
          display: true,
          text: `${activeSymbol} Live Price`,
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
      },
    }),
    [activeSymbol]
  );

  function resetChart(symbol) {
    setChartData({
      labels: [],
      datasets: [
        {
          label: `${symbol} Price`,
          data: [],
          borderColor: "#1d4ed8",
          backgroundColor: "rgba(29, 78, 216, 0.2)",
          tension: 0.25,
        },
      ],
    });
  }

  function closeSocket() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }

  function bindSocketHandlers(ws, symbol) {
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setConnectionState(`Connected: ${symbol}`);
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;

      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "subscription" && payload.symbol) {
          setActiveSymbol(payload.symbol);
          setConnectionState(`Connected: ${payload.symbol}`);
          return;
        }

        if (payload.type === "error") {
          setErrorText(payload.message || "WebSocket error");
          return;
        }

        if (payload.type !== "tick" || typeof payload.price !== "number") return;

        const now = Date.now();
        if (now - lastUpdateRef.current < THROTTLE_MS) return;
        lastUpdateRef.current = now;

        const tickSymbol = payload.symbol || symbol;
        const price = Number(payload.price);

        setActiveSymbol(tickSymbol);
        setChartData((prev) => {
          const labels = [...prev.labels, new Date(payload.time || now).toLocaleTimeString()];
          const points = [...prev.datasets[0].data, price];

          if (labels.length > WINDOW_SIZE) {
            labels.shift();
            points.shift();
          }

          return {
            labels,
            datasets: [
              {
                ...prev.datasets[0],
                label: `${tickSymbol} Price`,
                data: points,
              },
            ],
          };
        });
      } catch {
        setErrorText("Received invalid data payload");
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setErrorText("WebSocket connection failed");
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      setConnectionState(`Disconnected: ${symbol}`);
      wsRef.current = null;
    };
  }

  function connectSocket(symbol) {
    closeSocket();
    lastUpdateRef.current = 0;
    resetChart(symbol);
    setActiveSymbol(symbol);
    setConnectionState(`Connecting to ${symbol}...`);
    setErrorText("");

    const ws = new WebSocket(`${WS_URL}?symbol=${encodeURIComponent(symbol)}`);
    wsRef.current = ws;
    bindSocketHandlers(ws, symbol);
  }

  function handleSymbolSubmit(event) {
    event.preventDefault();
    const nextSymbol = normalizeSymbol(symbolInput);

    if (!nextSymbol) {
      setErrorText("Enter a valid symbol (example: NSE:TCS-EQ)");
      return;
    }

    connectSocket(nextSymbol);
  }

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}?symbol=${encodeURIComponent(DEFAULT_SYMBOL)}`);
    wsRef.current = ws;
    bindSocketHandlers(ws, DEFAULT_SYMBOL);

    return () => closeSocket();
  }, []);

  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "36px auto",
        padding: "20px",
        border: "1px solid #d1d5db",
        borderRadius: "12px",
        background: "#f8fafc",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "12px" }}>Fyers Live Ticks</h2>

      <form onSubmit={handleSymbolSubmit} style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
        <input
          type="text"
          value={symbolInput}
          onChange={(event) => setSymbolInput(event.target.value)}
          placeholder="NSE:TCS-EQ"
          style={{
            flex: 1,
            padding: "10px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 16px",
            border: "none",
            borderRadius: "8px",
            background: "#1d4ed8",
            color: "#ffffff",
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </form>

      <div style={{ marginBottom: "8px", fontSize: "14px", color: "#334155" }}>{connectionState}</div>
      {errorText ? <div style={{ marginBottom: "10px", color: "#dc2626", fontSize: "14px" }}>{errorText}</div> : null}

      <div style={{ height: "420px", background: "#ffffff", borderRadius: "10px", padding: "12px" }}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}
