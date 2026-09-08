import express from "express";
import apiV1Routes from "./routes";

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) =>
    res.json({ status: "ok", timestamp: new Date().toISOString() }),
  );

    app.use("/api/v1", apiV1Routes);


  return app;
}
