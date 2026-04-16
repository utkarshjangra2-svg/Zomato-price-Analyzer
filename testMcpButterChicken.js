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
      keyword: "butter chicken",
      address_id: bestAddressId
    });
    
    if (searchRes?.success && searchRes?.result?.length) {
      const rawSearch = searchRes.result[0].text || "";
      const jsonMatch2 = rawSearch.match(/\{[\s\S]+?\}(?=\s*\{|\s*$)/);
      const parsedData = JSON.parse(jsonMatch2 ? jsonMatch2[0] : rawSearch);
      
      if (parsedData?.results?.length) {
        console.log("First 3 restaurants:");
        parsedData.results.slice(0, 3).forEach(r => {
           console.log("- " + r.name);
           if (r.items) {
               console.log("  Items:", r.items.map(i => i.name).join(", "));
           }
        });
      }
    }
  } catch(e) {} finally {
      await disconnectZomatoMcp();
  }
}
test();
