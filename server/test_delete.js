require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('./models/User'); // wait, the models are in server.js?

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await mongoose.connection.collection('users').findOne({});
  console.log("User:", user);
  process.exit(0);
}
test();
