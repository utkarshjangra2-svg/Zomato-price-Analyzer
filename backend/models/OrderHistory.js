import mongoose from "mongoose";

const orderHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    restaurant: {
      type: String,
      required: true
    },
    dishName: {
      type: String,
      default: ""
    },
    cuisine: {
      type: String,
      default: ""
    },
    location: {
      type: String,
      default: ""
    },
    imageUrl: {
      type: String,
      default: ""
    },
    orderUrl: {
      type: String,
      default: ""
    },
    finalPrice: {
      type: Number,
      default: 0
    },
    couponAdjustedPrice: {
      type: Number,
      default: 0
    },
    originalPrice: {
      type: Number,
      default: 0
    },
    zomatoOrderId: {
      type: String,
      default: ""
    },
    discount: {
      type: Number,
      default: 0
    },
    rating: {
      type: Number,
      default: 0
    },
    confidence: {
      type: Number,
      default: 0
    },
    eta: {
      type: String,
      default: ""
    },
    source: {
      type: String,
      default: ""
    },
    orderedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

export default mongoose.model("OrderHistory", orderHistorySchema);
