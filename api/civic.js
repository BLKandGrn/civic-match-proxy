export default async function handler(req, res) {
  // Allow requests from anywhere (CORS)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { address, endpoint } = req.query;

  if (!address) {
    return res.status(400).json({ error: "Address is required" });
  }

  const API_KEY = process.env.GOOGLE_CIVIC_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    let url;

    if (endpoint === "elections") {
      // Voter info endpoint — returns elections, polling places, registration info
      url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${API_KEY}&address=${encodeURIComponent(address)}&returnAllAvailableData=true`;
    } else {
      // Representatives endpoint — returns elected officials by district
      url = `https://www.googleapis.com/civicinfo/v2/representatives?key=${API_KEY}&address=${encodeURIComponent(address)}&includeOffices=true`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "Civic API error", details: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: "Proxy error", message: err.message });
  }
}
