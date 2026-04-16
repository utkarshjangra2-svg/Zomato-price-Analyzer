import { connectToZomatoMcp, callZomatoMcpTool } from './services/zomatoOfficialMcp.js';

try {
  await connectToZomatoMcp();
  
  // Step 1: Get addresses
  const a = await callZomatoMcpTool('get_saved_addresses_for_user', {});
  const rawText = a.result?.[0]?.text || '';
  console.log('RAW ADDRESS TEXT (first 500):', rawText.substring(0, 500));
  
  let obj;
  try {
    obj = JSON.parse(rawText);
  } catch (parseErr) {
    // Try to find JSON in text
    const jsonMatch = rawText.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      obj = JSON.parse(jsonMatch[0]);
    } else {
      console.error('Cannot parse addresses:', parseErr.message);
      process.exit(1);
    }
  }
  
  const addresses = obj.addresses || obj.data?.addresses || obj.result?.addresses || [];
  console.log('Parsed addresses count:', addresses.length);
  console.log('First address keys:', Object.keys(addresses[0] || {}));
  console.log('First address sample:', JSON.stringify(addresses[0], null, 2).substring(0, 300));
  
} catch (e) {
  console.error('FULL ERROR:', e.message);
  console.error(e.stack);
}
process.exit(0);
