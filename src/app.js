require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { PubSub } = require("@google-cloud/pubsub");
const Redis = require("ioredis");
const RateLimitRedisStore = require("rate-limit-redis").default;

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// MongoDB Schema and Model
const ClickSchema = new mongoose.Schema({
  button: String,
  timestamp: { type: Date, default: Date.now },
  ip: String,
});
const Click = mongoose.model("Click", ClickSchema);

// Redis Client
const redisClient = new Redis(process.env.REDIS_URI, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

// Pub/Sub Client
const pubSubClient = new PubSub();
const topicName = process.env.TOPIC_NAME || "rate-limit-events";

// Function to Ensure Topic Exists
async function ensureTopicExists(topicName) {
  try {
    const [topics] = await pubSubClient.getTopics();
    const topicExists = topics.some((t) => t.name.endsWith(topicName));

    if (!topicExists) {
      console.error(`Topic ${topicName} does not exist. Please create it.`);
      process.exit(1); // Exit the app if the topic is missing
    } else {
      console.log(`Topic ${topicName} exists.`);
    }
  } catch (err) {
    console.error("Error checking for topic existence:", err);
    process.exit(1); // Exit the app if there's an error
  }
}

// Ensure the topic exists before starting the server
ensureTopicExists(topicName);

// Rate Limiter Creation
const createRateLimiter = (button) =>
  rateLimit({
    windowMs: 60 * 1000, // 1-minute window
    max: 10, // Limit each IP to 10 requests per windowMs
    store: new RateLimitRedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
    handler: (req, res) => {
      const message = JSON.stringify({
        button,
        timestamp: new Date().toISOString(),
        ip: req.ip,
      });

      pubSubClient
        .topic(topicName)
        .publishMessage({ data: Buffer.from(message) })
        .then(() => console.log(`Rate limit event published for ${button}.`))
        .catch((err) =>
          console.error(`Failed to publish event for ${button}:`, err)
        );

      res
        .status(429)
        .json({ message: `Rate limit reached for ${button} button.` });
    },
  });

// Routes
app.post("/click/blue", createRateLimiter("blue"), async (req, res) => {
  try {
    const click = new Click({ button: "blue", ip: req.ip });
    await click.save();
    res.status(200).json({ message: "Blue button clicked." });
  } catch (err) {
    res.status(500).json({ message: "Error saving click data." });
  }
});

app.post("/click/red", createRateLimiter("red"), async (req, res) => {
  try {
    const click = new Click({ button: "red", ip: req.ip });
    await click.save();
    res.status(200).json({ message: "Red button clicked." });
  } catch (err) {
    res.status(500).json({ message: "Error saving click data." });
  }
});

app.get("/", (req, res) => res.sendFile(__dirname + "/public/index.html"));

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
