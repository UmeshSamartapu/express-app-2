const mongoose = require("mongoose");

const ClickSchema = new mongoose.Schema({
  button: String,
  timestamp: { type: Date, default: Date.now },
  ip: String,
});

const Click = mongoose.model("Click", ClickSchema);
module.exports = Click;
