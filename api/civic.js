export default async function handler(req, res) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { address, state, district, endpoint, memberId, legislatorId } = req.query;

  const GOOGLE_KEY = process.env.GOOGLE_CIVIC_API_KEY;
  const FEC_KEY = process.env.FEC_API_KEY || "DEMO_KEY";
      const BREVO_KEY = process.env.BREVO_API_KEY;
      const CONGRESS_KEY = process.env.CONGRESS_API_KEY;
      const OPEN_STATES_KEY = process.env.OPEN_STATES_API_KEY;
      const DEMOCRACY_WORKS_KEY = process.env.DEMOCRACY_WORKS_API_KEY;

  try {
          // Congress.gov: members by state/district
        if (endpoint === "congress-members") {
                  if (!state) return res.status(400).json({ error: "state required" });
                  if (!CONGRESS_KEY) return res.status(500).json({ error: "Congress API key not configured" });
                  let url = `https://api.congress.gov/v3/member?api_key=${CONGRESS_KEY}&limit=20&currentMember=true&stateCode=${state.toUpperCase()}`;
                  if (district) url += `&district=${district}`;
                  const response = await fetch(url);
                  const data = await response.json();
                  return res.status(200).json(data);
        }

        // Congress.gov: member voting record
        if (endpoint === "member-votes") {
                  if (!memberId) return res.status(400).json({ error: "memberId required" });
                  if (!CONGRESS_KEY) return res.status(500).json({ error: "Congress API key not configured" });
                  const url = `https://api.congress.gov/v3/member/${memberId}/votes?api_key=${CONGRESS_KEY}&limit=50`;
                  const response = await fetch(url);
                  const data = await response.json();
                  return res.status(200).json(data);
        }

        // OpenStates: legislators by address
        if (endpoint === "state-legislators") {
                  if (!address) return res.status(400).json({ error: "address required" });
                  if (!OPEN_STATES_KEY) return res.status(500).json({ error: "OpenStates API key not configured" });
                  const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`, { headers: { "User-Agent": "civic-match-app" } });
                  const geoData = await geoRes.json();
                  if (!geoData || !geoData[0]) return res.status(200).json({ results: [] });
                  const { lat, lon } = geoData[0];
                  const url = `https://v3.openstates.org/people.geo?lat=${lat}&lng=${lon}&apikey=${OPEN_STATES_KEY}`;
                  const response = await fetch(url);
                  const data = await response.json();
                  return res.status(200).json(data);
        }

        // Google Civic: elections — filter out VIP test record (ID 2000)
        if (endpoint === "elections") {
                  if (!address) return res.status(400).json({ error: "address required" });
                  if (!GOOGLE_KEY) return res.status(500).json({ error: "Google API key not configured" });
                  const url = `https://www.googleapis.com/civicinfo/v2/voterinfo?key=${GOOGLE_KEY}&address=${encodeURIComponent(address)}&returnAllAvailableData=true`;
                  const response = await fetch(url);
                  const data = await response.json();
                  const election = (data.election && data.election.id !== "2000") ? data.election : null;
                  return res.status(200).json({ election });
        }

        // OpenStates: legislator votes
        if (endpoint === "legislator-votes") {
                  if (!legislatorId) return res.status(400).json({ error: "legislatorId required" });
                  if (!OPEN_STATES_KEY) return res.status(500).json({ error: "OpenStates API key not configured" });
                  const url = `https://v3.openstates.org/votes?person=${legislatorId}&apikey=${OPEN_STATES_KEY}&limit=50`;
                  const response = await fetch(url);
                  const data = await response.json();
                  return res.status(200).json(data);
        }

        // Google Civic: representatives
        if (endpoint === "representatives" || (!endpoint && address)) {
                  if (!address) return res.status(400).json({ error: "address required" });
                  if (!GOOGLE_KEY) return res.status(500).json({ error: "Google API key not configured" });
                  const url = `https://www.googleapis.com/civicinfo/v2/representatives?key=${GOOGLE_KEY}&address=${encodeURIComponent(address)}&includeOffices=true`;
                  const response = await fetch(url);
                  const data = await response.json();
                  console.log("Google Civic raw:", JSON.stringify(data).slice(0, 500));
                  if (data.error) return res.status(200).json({ error: data.error.message, offices: [], officials: [] });
                  return res.status(200).json(data);
        }

        // Democracy Works: upcoming elections by state OCD-ID
        if (endpoint === "dw-elections") {
          if (!state) return res.status(400).json({ error: "state required" });
          if (!DEMOCRACY_WORKS_KEY) return res.status(500).json({ error: "Democracy Works API key not configured" });
          const ocdId = `ocd-division/country:us/state:${state.toLowerCase()}`;
          const url = `https://api.democracy.works/elections/upcoming?district-divisions=${encodeURIComponent(ocdId)}`;
          const response = await fetch(url, { headers: { "Accept": "application/json", "Authorization": `apikey ${DEMOCRACY_WORKS_KEY}` } });
          const data = await response.json();
          return res.status(200).json(data);
        }

        // Democracy Works: state authority URLs (registration, polling place)
        if (endpoint === "dw-state-urls") {
          if (!state) return res.status(400).json({ error: "state required" });
          if (!DEMOCRACY_WORKS_KEY) return res.status(500).json({ error: "Democracy Works API key not configured" });
          const url = `https://api.democracy.works/election-authorities/state-urls/${state.toLowerCase()}`;
          const response = await fetch(url, { headers: { "Accept": "application/json", "Authorization": `apikey ${DEMOCRACY_WORKS_KEY}` } });
          const data = await response.json();
          return res.status(200).json(data);
        }

        // Brevo: add contact to election reminders list
        if (endpoint === "subscribe") {
          const { email, name, phone } = req.query;
          if (!email) return res.status(400).json({ error: "email required" });
          if (!BREVO_KEY) return res.status(500).json({ error: "Brevo API key not configured" });

          const contact = {
            email,
            listIds: [33],
            updateEnabled: true,
            attributes: {}
          };
          if (name) contact.attributes.FIRSTNAME = name.split(" ")[0];
          if (name && name.split(" ").length > 1) contact.attributes.LASTNAME = name.split(" ").slice(1).join(" ");
          if (phone) contact.attributes.SMS = phone;

          const brevoRes = await fetch("https://api.brevo.com/v3/contacts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": BREVO_KEY
            },
            body: JSON.stringify(contact)
          });

          const brevoData = await brevoRes.json().catch(function() { return {}; });
          if (brevoRes.ok || brevoRes.status === 204) {
            return res.status(200).json({ success: true, message: "Subscribed successfully" });
          } else if (brevoRes.status === 400 && brevoData.code === "duplicate_parameter") {
            // Contact already exists - update their list
            return res.status(200).json({ success: true, message: "Already subscribed" });
          } else {
            return res.status(500).json({ error: "Subscription failed", details: brevoData });
          }
        }

      
// OpenFEC: search candidates by state + office
        if (endpoint === "fec-candidates") {
          const { state, office, cycle } = req.query;
          const electionCycle = cycle || "2026";
          let url = `https://api.open.fec.gov/v1/candidates/?api_key=${FEC_KEY}&per_page=20&sort=name&election_year=${electionCycle}`;
          if (state) url += `&state=${state.toUpperCase()}`;
          if (office) url += `&office=${office.toUpperCase()}`;
          const response = await fetch(url);
          const data = await response.json();
          return res.status(200).json(data);
        }

        // OpenFEC: candidate totals (total raised)
        if (endpoint === "fec-totals") {
          const { candidateId, cycle } = req.query;
          if (!candidateId) return res.status(400).json({ error: "candidateId required" });
          const electionCycle = cycle || "2026";
          const url = `https://api.open.fec.gov/v1/candidate/${candidateId}/totals/?api_key=${FEC_KEY}&cycle=${electionCycle}&per_page=1`;
          const response = await fetch(url);
          const data = await response.json();
          return res.status(200).json(data);
        }

        // OpenFEC: top donors (schedule A by committee)
        if (endpoint === "fec-donors") {
          const { committeeId, cycle } = req.query;
          if (!committeeId) return res.status(400).json({ error: "committeeId required" });
          const electionCycle = cycle || "2026";
          const url = `https://api.open.fec.gov/v1/schedules/schedule_a/by_employer/?api_key=${FEC_KEY}&committee_id=${committeeId}&cycle=${electionCycle}&sort=-total&per_page=5`;
          const response = await fetch(url);
          const data = await response.json();
          return res.status(200).json(data);
        }

        // OpenFEC: get candidate's principal committee ID
        if (endpoint === "fec-committee") {
          const { candidateId, cycle } = req.query;
          if (!candidateId) return res.status(400).json({ error: "candidateId required" });
          const electionCycle = cycle || "2026";
          const url = `https://api.open.fec.gov/v1/candidate/${candidateId}/committees/?api_key=${FEC_KEY}&cycle=${electionCycle}&designation=P&per_page=1`;
          const response = await fetch(url);
          const data = await response.json();
          return res.status(200).json(data);
        }

        if (endpoint === "candidate-bio") {
          const ANTH_KEY = process.env.ANTHROPIC_API_KEY;
          if (!ANTH_KEY) return res.status(500).json({ error: "Anthropic API key not configured" });
          let bodyData = {};
          if (req.body) bodyData = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
          const { name, office, state } = bodyData;
          if (!name) return res.status(400).json({ error: "name required" });
          // FEC names are ALL CAPS LAST, FIRST — convert to readable format
          function formatFecName(raw) {
            if (!raw || raw !== raw.toUpperCase()) return raw;
            const parts = raw.split(",");
            if (parts.length < 2) return raw.split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
            const last = parts[0].trim().split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
            const first = parts[1].trim().split(" ").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
            return first + " " + last;
          }
          const readableName = formatFecName(name);
          const prompt = `Search for ${readableName}'s publicly stated policy positions for their ${office || "federal"} race in ${state || "the US"}. Respond with ONLY a 2-3 sentence factual summary of their positions — no preamble, no "Based on my search", no explanation. Use only verified sources. If no public record exists after searching, respond with only: "Limited public record. Visit their FEC profile or search their name for campaign information."`;
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": ANTH_KEY, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5",
              max_tokens: 400,
              tools: [{ type: "web_search_20250305", name: "web_search" }],
              messages: [{ role: "user", content: prompt }]
            })
          });
          const data = await response.json();
          // Extract text from response — may have tool_use blocks
          const textBlock = (data.content || []).find(function(b) { return b.type === "text"; });
          const text = textBlock ? textBlock.text : "Limited public record.";
          return res.status(200).json({ text });
        }

        if (endpoint === "generate-guide") {
  const ANTH_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTH_KEY) return res.status(500).json({ error: "Anthropic API key not configured" });
 let bodyData = {};
if (req.body) {
  bodyData = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
}
const prompt = bodyData.prompt || req.query.prompt;
  if (!prompt) return res.status(400).json({ error: "prompt required" });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTH_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json();
  return res.status(200).json(data);
}
          return res.status(400).json({ error: "Missing required parameters" });
  } catch (err) {
          return res.status(500).json({ error: "Proxy error", message: err.message });
  }
}
