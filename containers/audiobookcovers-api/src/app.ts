import express, { Application, Request, Response } from 'express';

const app: Application = express();
const PORT = 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, world! This is an Express server using TypeScript.');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
