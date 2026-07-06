/**
 * BookRec — Node.js / Express Backend
 *
 * Acts as the bridge between the React frontend, MongoDB, and the
 * FastAPI ML microservice. Handles authentication, user management,
 * onboarding, and proxies recommendation / explanation requests.
 */

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const app = express();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/bookrec";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors({ origin: "*" }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Mongoose Models
// ---------------------------------------------------------------------------

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    proxy_svd_id: { type: Number, default: null },
    read_history: { type: [Number], default: [] },
    onboarded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const bookSchema = new mongoose.Schema({
  book_id: { type: Number, required: true, unique: true, index: true },
  title: { type: String, required: true },
  authors: { type: String, default: "" },
  cover_image_url: { type: String, default: "" },
  average_rating: { type: Number, default: 0 },
  ratings_count: { type: Number, default: 0 },
  description: { type: String, default: "" },
});

const User = mongoose.model("User", userSchema);
const Book = mongoose.model("Book", bookSchema);

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------

// POST /auth/register
app.post("/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check existing
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });
    if (existingUser) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, password_hash });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        onboarded: user.onboarded,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        onboarded: user.onboarded,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// Book Routes
// ---------------------------------------------------------------------------

// GET /books/popular
app.get("/books/popular", async (req, res) => {
  try {
    const books = await Book.find().sort({ book_id: 1 }).limit(100);
    res.json(books);
  } catch (err) {
    console.error("Popular error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /books/random — return N random books
app.get("/books/random", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const books = await Book.aggregate([{ $sample: { size: limit } }]);
    res.json(books);
  } catch (err) {
    console.error("Random books error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /books/search
app.get("/books/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);
    const regex = new RegExp(q, "i");
    const books = await Book.find({
      $or: [{ title: regex }, { authors: regex }]
    }).limit(10);
    res.json(books);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /books/onboarding — return 20 random books from the seeded collection
app.get("/books/onboarding", async (req, res) => {
  try {
    const books = await Book.aggregate([{ $sample: { size: 20 } }]);
    res.json({ books });
  } catch (err) {
    console.error("Onboarding books error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /books/:id
app.get("/books/:id", async (req, res) => {
  try {
    const book_id = parseInt(req.params.id, 10);
    if (isNaN(book_id)) {
      return res.status(400).json({ error: "Invalid book_id" });
    }
    let book = await Book.findOne({ book_id });
    if (!book) return res.status(404).json({ error: "Book not found" });

    // Lazy Load Description if missing
    if (!book.description) {
      try {
        const cleanTitle = book.title.replace(/\s*\(.*?\)\s*/g, "").trim();
        const cleanAuthor = book.authors ? book.authors.split(",")[0].trim() : "";
        
        // 1. Search OpenLibrary for the work
        const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanTitle)}&author=${encodeURIComponent(cleanAuthor)}&limit=1`;
        const searchRes = await axios.get(searchUrl, { timeout: 8000 });
        
        let newDesc = "Description not available.";
        
        if (searchRes.data && searchRes.data.docs && searchRes.data.docs.length > 0) {
          const key = searchRes.data.docs[0].key; // e.g. /works/OL1234W
          
          // 2. Fetch the specific work to get the description
          const workUrl = `https://openlibrary.org${key}.json`;
          const workRes = await axios.get(workUrl, { timeout: 8000 });
          
          if (workRes.data && workRes.data.description) {
            if (typeof workRes.data.description === 'string') {
              if (workRes.data.description.trim().length > 10) {
                newDesc = workRes.data.description.trim();
              }
            } else if (workRes.data.description.value) {
              if (workRes.data.description.value.trim().length > 10) {
                newDesc = workRes.data.description.value.trim();
              }
            }
          }
        }
        
        // Save to DB so we cache the result
        book.description = newDesc;
        await book.save();
      } catch (err) {
        console.error("OpenLibrary Fetch Error:", err.message);
        // Do NOT save to MongoDB if it fails due to network/API issues.
        // Just return a temporary placeholder to the frontend.
        book = book.toObject();
        book.description = "We are currently unable to fetch the description. Please try again later.";
      }
    }

    res.json(book);
  } catch (err) {
    console.error("Fetch book error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// ---------------------------------------------------------------------------
// User Routes
// ---------------------------------------------------------------------------

// GET /user/liked
app.get("/user/liked", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const books = await Book.find({ book_id: { $in: user.read_history } });
    res.json(books);
  } catch (err) {
    console.error("Fetch liked error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /user/like
app.post("/user/like", authMiddleware, async (req, res) => {
  try {
    const { book_id } = req.body;
    if (!book_id) return res.status(400).json({ error: "book_id required" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.read_history.includes(book_id)) {
      return res.status(400).json({ error: "Book already liked" });
    }

    user.read_history.push(book_id);

    // Re-calculate proxy_svd_id
    try {
      const mlRes = await axios.post(`${FASTAPI_URL}/proxy-match`, {
        book_ids: user.read_history,
      });
      user.proxy_svd_id = mlRes.data.proxy_svd_id;
    } catch (mlErr) {
      console.error("FastAPI /proxy-match error:", mlErr.message);
    }

    await user.save();
    res.json({ message: "Book liked", read_history: user.read_history });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /user/onboard — save 3 selected books + get proxy SVD ID
app.post("/user/onboard", authMiddleware, async (req, res) => {
  try {
    const { book_ids } = req.body; // array of 3 book_ids

    if (!book_ids || !Array.isArray(book_ids) || book_ids.length !== 3) {
      return res.status(400).json({ error: "Exactly 3 book_ids are required" });
    }

    // Call FastAPI /proxy-match
    let proxy_svd_id = null;
    try {
      const mlRes = await axios.post(`${FASTAPI_URL}/proxy-match`, {
        book_ids,
      });
      proxy_svd_id = mlRes.data.proxy_svd_id;
    } catch (mlErr) {
      console.error("FastAPI /proxy-match error:", mlErr.message);
      // Use a fallback proxy ID (a common user)
      proxy_svd_id = 314;
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        read_history: book_ids,
        proxy_svd_id,
        onboarded: true,
      },
      { new: true }
    );

    if (!user) {
      return res.status(401).json({ error: "User not found in database. Your session might be from an old database. Please log out and register again." });
    }

    res.json({
      message: "Onboarding complete",
      user: {
        id: user._id,
        username: user.username,
        onboarded: user.onboarded,
        proxy_svd_id: user.proxy_svd_id,
        read_history: user.read_history,
      },
    });
  } catch (err) {
    console.error("Onboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /user/dashboard — fetch hybrid recommendations
app.get("/user/dashboard", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.onboarded) {
      return res.status(400).json({ error: "User has not completed onboarding" });
    }

    // Call FastAPI /recommend
    const mlRes = await axios.post(`${FASTAPI_URL}/recommend`, {
      proxy_svd_id: user.proxy_svd_id,
      recent_liked_book_ids: user.read_history,
    });

    const mlRecommendations = mlRes.data.recommendations;
    
    // Fetch full book details from MongoDB for the recommended books
    const bookIds = mlRecommendations.map(r => r.book_id);
    const dbBooks = await Book.find({ book_id: { $in: bookIds } });
    
    // Merge ML content with DB fields (so we keep the 'content' field for explanations, but add cover_image_url)
    const enrichedRecommendations = mlRecommendations.map(mlBook => {
      const dbBook = dbBooks.find(b => b.book_id === mlBook.book_id);
      return {
        ...mlBook,
        cover_image_url: dbBook ? dbBook.cover_image_url : "",
        average_rating: dbBook ? dbBook.average_rating : 0,
        ratings_count: dbBook ? dbBook.ratings_count : 0
      };
    });

    res.json({
      recommendations: enrichedRecommendations,
      user: {
        username: user.username,
        read_history: user.read_history,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
});

// POST /user/explain — get AI explanation for a recommendation
app.post("/user/explain", authMiddleware, async (req, res) => {
  try {
    const { user_read_history, recommended_book } = req.body;

    const mlRes = await axios.post(`${FASTAPI_URL}/explain`, {
      user_read_history,
      recommended_book,
    });

    res.json({ explanation: mlRes.data.explanation });
  } catch (err) {
    console.error("Explain error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

// GET /user/me — get current user info
app.get("/user/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password_hash");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// Book Routes
// ---------------------------------------------------------------------------




// ---------------------------------------------------------------------------
// Seed Data — 50 popular books
// ---------------------------------------------------------------------------
const SEED_BOOKS = [
  { book_id: 2767052, title: "The Hunger Games", authors: "Suzanne Collins" },
  { book_id: 3, title: "Harry Potter and the Sorcerer's Stone", authors: "J.K. Rowling" },
  { book_id: 41865, title: "Twilight", authors: "Stephenie Meyer" },
  { book_id: 2657, title: "To Kill a Mockingbird", authors: "Harper Lee" },
  { book_id: 4671, title: "The Great Gatsby", authors: "F. Scott Fitzgerald" },
  { book_id: 11870085, title: "The Fault in Our Stars", authors: "John Green" },
  { book_id: 5907, title: "The Hobbit", authors: "J.R.R. Tolkien" },
  { book_id: 5107, title: "The Catcher in the Rye", authors: "J.D. Salinger" },
  { book_id: 960, title: "Angels & Demons", authors: "Dan Brown" },
  { book_id: 1885, title: "Pride and Prejudice", authors: "Jane Austen" },
  { book_id: 77203, title: "The Kite Runner", authors: "Khaled Hosseini" },
  { book_id: 13335037, title: "Divergent", authors: "Veronica Roth" },
  { book_id: 5470, title: "1984", authors: "George Orwell" },
  { book_id: 7613, title: "Animal Farm", authors: "George Orwell" },
  { book_id: 48855, title: "The Diary of a Young Girl", authors: "Anne Frank" },
  { book_id: 2429135, title: "The Girl with the Dragon Tattoo", authors: "Stieg Larsson" },
  { book_id: 6148028, title: "Catching Fire", authors: "Suzanne Collins" },
  { book_id: 5, title: "Harry Potter and the Prisoner of Azkaban", authors: "J.K. Rowling" },
  { book_id: 34, title: "The Fellowship of the Ring", authors: "J.R.R. Tolkien" },
  { book_id: 7260188, title: "Mockingjay", authors: "Suzanne Collins" },
  { book_id: 2, title: "Harry Potter and the Order of the Phoenix", authors: "J.K. Rowling" },
  { book_id: 12232938, title: "The Lovely Bones", authors: "Alice Sebold" },
  { book_id: 15881, title: "Harry Potter and the Chamber of Secrets", authors: "J.K. Rowling" },
  { book_id: 6, title: "Harry Potter and the Goblet of Fire", authors: "J.K. Rowling" },
  { book_id: 136251, title: "Harry Potter and the Deathly Hallows", authors: "J.K. Rowling" },
  { book_id: 968, title: "The Da Vinci Code", authors: "Dan Brown" },
  { book_id: 1, title: "Harry Potter and the Half-Blood Prince", authors: "J.K. Rowling" },
  { book_id: 7624, title: "Lord of the Flies", authors: "William Golding" },
  { book_id: 18135, title: "Romeo and Juliet", authors: "William Shakespeare" },
  { book_id: 8442457, title: "Gone Girl", authors: "Gillian Flynn" },
  { book_id: 4667024, title: "The Help", authors: "Kathryn Stockett" },
  { book_id: 890, title: "Of Mice and Men", authors: "John Steinbeck" },
  { book_id: 930, title: "Memoirs of a Geisha", authors: "Arthur Golden" },
  { book_id: 10818853, title: "Fifty Shades of Grey", authors: "E.L. James" },
  { book_id: 865, title: "The Alchemist", authors: "Paulo Coelho" },
  { book_id: 3636, title: "The Giver", authors: "Lois Lowry" },
  { book_id: 100915, title: "The Lion, the Witch, and the Wardrobe", authors: "C.S. Lewis" },
  { book_id: 14050, title: "The Time Traveler's Wife", authors: "Audrey Niffenegger" },
  { book_id: 13496, title: "A Game of Thrones", authors: "George R.R. Martin" },
  { book_id: 19501, title: "Eat, Pray, Love", authors: "Elizabeth Gilbert" },
  { book_id: 28187, title: "The Lightning Thief", authors: "Rick Riordan" },
  { book_id: 1934, title: "Little Women", authors: "Louisa May Alcott" },
  { book_id: 10210, title: "Jane Eyre", authors: "Charlotte Brontë" },
  { book_id: 15931, title: "The Notebook", authors: "Nicholas Sparks" },
  { book_id: 4214, title: "Life of Pi", authors: "Yann Martel" },
  { book_id: 43641, title: "Water for Elephants", authors: "Sara Gruen" },
  { book_id: 19063, title: "The Book Thief", authors: "Markus Zusak" },
  { book_id: 4381, title: "Fahrenheit 451", authors: "Ray Bradbury" },
  { book_id: 49041, title: "New Moon", authors: "Stephenie Meyer" },
  { book_id: 30119, title: "Where the Sidewalk Ends", authors: "Shel Silverstein" },
];

async function seedBooks() {
  const count = await Book.countDocuments();
  if (count === 0) {
    await Book.insertMany(SEED_BOOKS);
    console.log(`📚 Seeded ${SEED_BOOKS.length} books`);
  } else {
    console.log(`📚 Books collection already has ${count} documents`);
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "bookrec-api" });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function start() {
  console.log(`Connecting to MongoDB at: ${MONGO_URI.replace(/:([^:@]{3,})@/, ':***@')}`);
  mongoose.connect(MONGO_URI)
    .then(async () => {
      console.log("✅ MongoDB Connected!");
      
      await seedBooks();

      app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('❌ Connection Error Specifics:', err);
      process.exit(1);
    });
}

start();
