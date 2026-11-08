const mongoose = require("mongoose");
const app = require("./src/app");

const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/House_rental_application";

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("Database connection established");
    app.listen(port, () => console.log(`Server started on port ${port}`));
  })
  .catch((error) => console.error("Database connection failed:", error.message));
