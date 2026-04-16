import { connectToZomatoMcp, callZomatoMcpTool, disconnectZomatoMcp } from "./backend/services/zomatoOfficialMcp.js";
import dotenv from "dotenv";
dotenv.config({ path: "./backend/.env" });

async function test() {
  try {
    await connectToZomatoMcp();
    
    // Get Address
    const addressRes = await callZomatoMcpTool("get_saved_addresses_for_user", {});
    let bestAddressId = "";
    if (addressRes?.success && addressRes?.result?.length) {
      const rawText = addressRes.result[0].text || "";
      const jsonMatch = rawText.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
      const authData = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      const addresses = authData?.addresses || authData?.data?.addresses || [];
      if (addresses.length > 0) {
        bestAddressId = String(addresses[0].address_id || addresses[0].id || "");
      }
    }
    
    if (!bestAddressId) {
      console.log("No address found");
      return;
    }
    
    const searchRes = await callZomatoMcpTool("get_restaurants_for_keyword", {
      keyword: "pizza",
      address_id: bestAddressId
    });
    
    if (searchRes?.success && searchRes?.result?.length) {
      const rawSearch = searchRes.result[0].text || "";
      console.log("RAW SEARCH LENGTH:", rawSearch.length);
      console.log("RAW SEARCH (first 500 chars):", rawSearch.slice(0, 500));
      
      const jsonMatch2 = rawSearch.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
      console.log("JSON MATCH IS:", !!jsonMatch2);
      
      const parsedData = JSON.parse(jsonMatch2 ? jsonMatch2[0] : rawSearch);
      console.log("KEYS of parsedData:", Object.keys(parsedData));
      
      if (parsedData?.results?.length) {
         console.log("First result:", Object.keys(parsedData.results[0]));
         console.log("RES_URL:", parsedData.results[0].res_url);
         console.log("Deep_Link:", parsedData.results[0].deep_link);
         console.log("URL:", parsedData.results[0].url);
      }
    }
  } catch (error) {
    console.error(error);
  } finally {
    await disconnectZomatoMcp();
  }
}
test();
