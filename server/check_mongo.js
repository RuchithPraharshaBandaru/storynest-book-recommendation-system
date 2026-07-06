const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bookrec";

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection;
  const book = await db.collection("books").findOne({});
  console.log(JSON.stringify(book, null, 2));
  mongoose.disconnect();
}
main();
