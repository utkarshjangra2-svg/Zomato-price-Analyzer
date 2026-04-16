const { connectToZomatoMcp, callZomatoMcpTool } = require('./services/zomatoOfficialMcp.js');

async function test() {
  await connectToZomatoMcp();
  const addressesRaw = await callZomatoMcpTool('get_saved_addresses_for_user', {});
  
  let addressId = "";
  let addressesObj = {};
  try {
    const text = addressesRaw.result[0].text;
    addressesObj = JSON.parse(text);
    if (addressesObj.addresses && addressesObj.addresses.length > 0) {
      addressId = addressesObj.addresses[0].id;
    }
  } catch (e) {}

  console.log("ADDRESS ID:", addressId || "NONE_FOUND");

  try {
    const res = await callZomatoMcpTool('get_restaurants_for_keyword', {
      keyword: "pizza",
      address_id: addressId
    });
    console.log("REST RESULT:", res.result[0].text.substring(0, 500) + "...");
  } catch(e) {
    console.log("REST ERR:", e.message);
  }
  process.exit(0);
}
test();
