const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const csv = require("csv-parser");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bookrec";

const bookSchema = new mongoose.Schema({
  book_id: { type: Number, required: true, unique: true, index: true },
  title: { type: String, required: true },
  authors: { type: String, default: "" },
  cover_image_url: { type: String, default: "" },
  average_rating: { type: Number, default: 0 },
  ratings_count: { type: Number, default: 0 },
});

const Book = mongoose.model("Book", bookSchema);

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.");

  const csvPath = path.join(__dirname, "..", "artifacts", "books.csv");
  const booksToUpdate = [];

  console.log("Parsing CSV...");
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on("data", (data) => {
      if (data.book_id) {
        booksToUpdate.push({
          book_id: parseInt(data.book_id, 10),
          title: data.title || "Unknown",
          authors: data.authors || "",
          average_rating: parseFloat(data.average_rating) || 0,
          ratings_count: parseInt(data.ratings_count, 10) || 0,
          image_url: data.image_url || data.small_image_url || "",
        });
      }
    })
    .on("end", async () => {
      console.log(`Parsed ${booksToUpdate.length} rows. Starting upsert in chunks...`);
      let count = 0;
      
      const chunkSize = 1000;
      for (let i = 0; i < booksToUpdate.length; i += chunkSize) {
        const chunk = booksToUpdate.slice(i, i + chunkSize);
        
        const bulkOps = chunk.map(b => ({
          updateOne: {
            filter: { book_id: b.book_id },
            update: {
              $set: {
                title: b.title,
                authors: b.authors,
                average_rating: b.average_rating,
                ratings_count: b.ratings_count,
                cover_image_url: b.image_url
              }
            },
            upsert: true
          }
        }));

        const result = await Book.bulkWrite(bulkOps, { ordered: false });
        count += chunk.length;
        console.log(`Upserted chunk... total processed: ${count}`);
      }

      console.log("Migration complete.");
      mongoose.disconnect();
    });
}

migrate();
