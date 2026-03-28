import {
  readJsonRequestBody,
  sendAutomationTestEmailFromServer,
  toAutomationTestEmailErrorResponse,
} from "../server/automation-test-email-handler.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Allow", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = await readJsonRequestBody(req);
    const result = await sendAutomationTestEmailFromServer({
      headers: req.headers,
      payload,
      env: process.env,
    });

    return res.status(200).json(result);
  } catch (error) {
    const response = toAutomationTestEmailErrorResponse(error);
    return res.status(response.status).json(response.body);
  }
}
