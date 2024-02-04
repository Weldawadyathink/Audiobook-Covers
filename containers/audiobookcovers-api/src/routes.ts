import express, {
  Application,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";
import { query } from "./db";
import { generateResponseObject, Item, ResponseObject } from "./utils";

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

export { router };
