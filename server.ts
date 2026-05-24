import express from "express";
import path from "path";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let's spawn the Python FastAPI backend on port 8000 as a subprocess
  console.log("[Server] Spawning Python FastAPI backend (uvicorn) on port 8000...");
  
  const pyProcess = spawn("python3", [
    "-m", "uvicorn", 
    "backend.main:app", 
    "--host", "127.0.0.1", 
    "--port", "8000"
  ], {
    stdio: "inherit",
    env: process.env, // Pass environment variables securely including GEMINI_API_KEY
  });

  pyProcess.on("error", (err) => {
    console.error("[Server] Failed to start Python backend subprocess:", err);
  });

  pyProcess.on("exit", (code) => {
    console.log(`[Server] Python FastAPI backend process exited with code ${code}`);
  });

  // Ensure child processes are killed when main process exits
  process.on("exit", () => {
    pyProcess.kill();
  });
  process.on("SIGINT", () => {
    pyProcess.kill();
    process.exit();
  });

  // Middleware
  app.use(express.json());

  // API router - Proxies all /api/* requests to FastAPI on port 8000
  app.all("/api/*", async (req, res) => {
    const targetPath = req.params[0] || "";
    const targetUrl = `http://127.0.0.1:8000/${targetPath}`;
    
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (req.headers["authorization"]) {
        headers["Authorization"] = req.headers["authorization"] as string;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (["POST", "PUT", "PATCH"].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).send(errorText);
      }

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (err: any) {
      console.error(`[Server API Proxy Error] Failed to fetch Python backend at ${targetUrl}:`, err.message);
      return res.status(502).json({
        error: "FastAPI Backend Unreachable",
        details: err.message,
        suggestion: "Please verify that the Python FastAPI / uvicorn backend running at uvicorn port 8000 is active."
      });
    }
  });

  // Vite middleware for development vs Static file serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("[Server] Vite development middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("[Server] Static production mode active. Serving files from dist/.");
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Server running on http://localhost:${PORT}`);
  });

  // Attach WebSocket Server to proxy websocket upgrades on port 3000 to FastAPI uvicorn on port 8000
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (wsClient, req) => {
    const urlStr = req.url || "";
    if (urlStr.startsWith("/ws/")) {
      const targetUrl = `ws://127.0.0.1:8000${urlStr}`;
      console.log(`[Express WS Proxy] Proxying WebSocket connection to: ${targetUrl}`);

      const backendWs = new WSWebSocket(targetUrl);

      backendWs.on("open", () => {
        // Broadcast any inbound client messages to backup FastAPI
        wsClient.on("message", (msg) => {
          backendWs.send(msg);
        });

        // Pipe backend stream to client
        backendWs.on("message", (msg) => {
          wsClient.send(msg.toString());
        });
      });

      backendWs.on("close", () => {
        wsClient.close();
      });

      backendWs.on("error", (err) => {
        console.error("[Express WS Proxy Error] Backend WebSocket error:", err.message);
        wsClient.close();
      });

      wsClient.on("close", () => {
        backendWs.close();
      });

      wsClient.on("error", (err) => {
        console.error("[Express WS Proxy Error] Client WebSocket error:", err.message);
        backendWs.close();
      });
    } else {
      wsClient.close(1011, "Unsupported route");
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url || "";
    if (pathname.startsWith("/ws/")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
}

startServer();
