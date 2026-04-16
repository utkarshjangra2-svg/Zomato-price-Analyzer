import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const optionalProtect = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const user = await User.findById(decoded.id).select("_id name email zomato");

    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
};
