import express, {
  Application,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";
import { query } from "./db";
import { generateResponseObject, Item, ResponseObject } from "./utils";

const app: Application = express();

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
    await query(
      `INSERT INTO api_log (url, endpoint, user_agent, origin, request_time, method, status_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [url, path, user_agent, origin, duration, method, status]
    );
  });
  next();
});

const router: Router = express.Router({ strict: false });

router.get("/", (req: Request, res: Response) => {
  res.send("Hello Audiobook Enthusiasts!");
});

router.get("/cover/bytext", (req: Request, res: Response) => {
  if (!req.query.q) {
    return res.status(400).send({ error: 'Query parameter "q" is required.' });
  }
  const searchString: string = <string>req.query.q;
  const formattedSearchString = searchString.split(" ").join(" & ");
  query(
      `SELECT
      id,
      extension,
      source
    FROM image
    WHERE
      to_tsvector('english', cloud_vision_text) @@
      to_tsquery('english', $1);`,
      [formattedSearchString]
    )
    .then((result: any) => result.rows)
    .then((items: any) => items.map(generateResponseObject))
    .then((response_obj: [ResponseObject]) =>
      res.status(200).send(response_obj)
    );
});

app.use(router);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
