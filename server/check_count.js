const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bookrec";

async function count() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const count = await db.collection("books").countDocuments();
  console.log(`Total books in MongoDB: ${count}`);
  mongoose.disconnect();
}
count();
