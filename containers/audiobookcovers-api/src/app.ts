import express, {
  Application,
  Request,
  Response,
  NextFunction,
  Router,
} from "express";

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


app.use(router);


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
