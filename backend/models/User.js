import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name:String,
  email:{
    type:String,
    required:true,
    unique:true
  },
  password:{
    type:String,
    required:true
  },
  resetToken:String,
  resetTokenExpire:Date,
  zomato: {
    linked: {
      type: Boolean,
      default: false
    },
    phoneNumber: String,
    uuid: String,
    name: String,
    email: String,
    isExistingUser: {
      type: Boolean,
      default: false
    },
    linkedAt: Date,
    lastVerifiedAt: Date,
    pendingAuthPacket: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  }
});

export default mongoose.model("User",userSchema);
