import express, { Application, Request, Response, NextFunction } from "express";
import { router } from "./routes";
import { query } from "./db";

const app: Application = express();

app.set("trust proxy", true);

// Handle CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

// Response logging
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const start = performance.now();
  res.on("finish", async () => {
    const duration = Math.trunc(performance.now() - start);
    const method = req.method;
    const url = req.originalUrl;
    const path = req.path;
    const status = res.statusCode;
    const user_agent = req.headers["user-agent"];
    const origin = req.headers["origin"];
    const ip = req.ip;
    console.log(`Served ${path}, status code ${status} in ${duration}ms.`)
    await query(
      `INSERT INTO api_log (url, endpoint, user_agent, origin, request_time, method, status_code, ip)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [url, path, user_agent, origin, duration, method, status, ip]
    );
  });
  next();
});

// import routes
app.use(router);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
