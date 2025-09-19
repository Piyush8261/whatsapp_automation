// models/ScheduledMessage.js
import mongoose from "mongoose";

const ScheduledMessageSchema = new mongoose.Schema({
  text: {
    type: String,
    required: false, // optional (because sometimes only media is sent)
  },
  group: {
    type: [String], // can be one or multiple groups
    required: true,
  },
  scheduleTime: {
    type: Date,
    required: true,
  },
  delay: {
    type: Number, // in seconds
    default: 5,
  },
  mediaUrl: {
    type: String, // for external link (optional)
  },
  mediaPath: {
    type: String, // for uploaded local file path (optional)
  },
  mediaType: {
    type: String, // image, video, audio, document
    enum: ["image", "video", "audio", "document", null],
    default: null,
  },
  sent: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("ScheduledMessage", ScheduledMessageSchema);
