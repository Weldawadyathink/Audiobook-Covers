import express, {
  Application,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";
import { query } from "./db";
import { generateResponseObject, Item, ResponseObject } from "./utils";
import Axios from "axios";
import { generateRandomUnitVector } from "./vectorTools";

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
    .then((response_obj: ResponseObject[]) => 
      res.status(200).send(response_obj)
    )
    .catch((error: any) => {
      console.error(error);
      res.status(500).send({ error: "Internal server error" });
    });
});

router.get("/cover/ai-search", (req: Request, res: Response) => {
  if (!req.query.q) {
    return res.status(400).send({ error: 'Query parameter "q" is required.' });
  }
  const searchString: string = <string>req.query.q;
  const topK = parseInt(<string>req.query.k) || 50;

  const url = `http://${process.env.CLIP_API_URL}/embedding/text?q=${searchString}`;
  const db_query = `
    SELECT
      id,
      extension,
      source
    FROM image
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;

  Axios.get(url)
    .then((result) => result.data)
    .then((embedding: any) => JSON.stringify(embedding))
    .then((embedding: any) => query(db_query, [embedding, topK]))
    .then((result: any) => result.rows)
    .then((items: any) => items.map(generateResponseObject))
    .then((response_obj: ResponseObject[]) => 
      res.status(200).send(response_obj)
    )
    .catch((error: any) => {
      console.error(error);
      res.status(500).send({ error: "Internal server error" });
    });
});

router.get("/cover/random", (req: Request, res: Response) => {
  const topK = parseInt(<string>req.query.k) || 50;
  const vector = generateRandomUnitVector(512);

  const db_query = `
    SELECT
      id,
      extension,
      source
    FROM image
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `;
  query(db_query, [JSON.stringify(vector), topK])
    .then((result: any) => result.rows)
    .then((items: any) => items.map(generateResponseObject))
    .then((response_obj: ResponseObject[]) =>
      res.status(200).send(response_obj)
    )
    .catch((error: any) => {
      console.error(error);
      res.status(500).send({error: "Internal server error"})
    })
});

router.get("/cover/id", (req: Request, res: Response) => {
  if (!req.query.id) {
    return res.status(400).send({ error: 'Query parameter "id" is required.' });
  }
  const id = <string>req.query.id;
  const db_query = `
    SELECT
      id,
      extension,
      source
    FROM image
    WHERE id = $1
  `;
  query(db_query, [id])
    .then((result: any) => result.rows)
    .then((rows: any) =>
      rows.length === 0 ? [] : generateResponseObject(rows[0])
    )
    .then((response_obj: any) =>
      res.status(200).send(response_obj)
    )
    .catch((error: any) => {
      console.error(error);
      res.status(500).send({ error: "Internal server error" });
    });
});

export { router };
