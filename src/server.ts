import express from "express";
import { run } from "./app/main";

// Run an express server to generate invoices on demand
const app = express();

app.get("/", (req, res) => {
  run().then(
    (result) => {
      res.send(result);
    },
    (error) => {
      res.status(400).send(error.message);
    }
  );
});

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
