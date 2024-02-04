import express, {
  Application,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";
import pool from "./db";
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

const router: Router = express.Router({ strict: false });

router.get("/", (req: Request, res: Response) => {
  res.send("Hello, world! This is an Express server using TypeScript.");
});

router.get("/cover/bytext", (req: Request, res: Response) => {
  if (!req.query.q) {
    return res.status(400).send({ error: 'Query parameter "q" is required.' });
  }
  const searchString: string = <string>req.query.q;
  const formattedSearchString = searchString.split(" ").join(" & ");
  pool.query(
    `
    SELECT
      id,
      extension,
      source
    FROM image
    WHERE
      to_tsvector('english', cloud_vision_text) @@
      to_tsquery('english', $1);
  `,
    [formattedSearchString]
  ).then((result: any) => result.rows)
  .then((items: any) => items.map(generateResponseObject))
  .then((response_obj: [ResponseObject]) => res.status(200).send(response_obj))

  // return res.status(200).send(formattedSearchString);
});

app.use(router);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  try {
    await pool.end();
    console.log("Database pool has been closed");
  } catch (error) {
    console.error("Error closing the database pool", error);
  }
  process.exit(0);
});
