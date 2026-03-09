import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { coursesRouter } from "./routes/courses.js";
import { roundsRouter } from "./routes/rounds.js";
import { statsRouter } from "./routes/stats.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/courses", coursesRouter);
app.use("/api/rounds", roundsRouter);
app.use("/api/stats", statsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
