const INBOX = "ryan@popbia.com";
const INTERESTS = ["Collection system", "Website / template", "Digital ordering", "Website + Collection", "Not sure yet", "Something else"];
const METHODS = ["Call out names", "Call out numbers", "Pagers / beepers", "SMS", "Existing collection display", "Other"];
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (error, status) => json({ ok: false, error }, status);

function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Please check your answers.");
  const data = {};
  for (const [key, max] of Object.entries({ name: 100, business: 160, email: 254, interest: 80, collectionMethod: 80, location: 200, message: 5000 })) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (key !== "message" && /[\r\n]/.test(value))) throw new Error("Please check your answers and their length.");
    data[key] = value.trim();
  }
  if (![data.name, data.business, data.message].every(Boolean) || !/^[^\s@<>(),;:"\\]+@[^\s@<>(),;:"\\]+\.[^\s@<>(),;:"\\]+$/.test(data.email) || !INTERESTS.includes(data.interest)) throw new Error("Please complete all required fields with a valid email address.");
  if (["Collection system", "Website + Collection"].includes(data.interest)) {
    if (!METHODS.includes(data.collectionMethod)) throw new Error("Please choose your current collection method.");
  } else data.collectionMethod = "Not applicable";
  return data;
}

function layout(title, body) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f5f2eb;color:#142c48;font-family:Arial,sans-serif;line-height:1.6"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:white;border-radius:16px"><tr><td style="padding:24px 32px;background:#142c48;color:white;font-size:26px;font-weight:bold;border-radius:16px 16px 0 0">PopBia<span style="color:#ff986c">.</span></td></tr><tr><td style="padding:24px 32px"><h1 style="font-size:24px;line-height:1.25">${title}</h1>${body}</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e7e5e0;color:#596574;font-size:12px">PopBia · Digital service for independent food businesses</td></tr></table></td></tr></table></body></html>`;
}

export function buildEmails(data, reference) {
  const fields = [["Name", data.name], ["Business", data.business], ["Email", data.email], ["Interested in", data.interest], ["Current collection method", data.collectionMethod], ["Where they trade", data.location || "Not provided"], ["Message", data.message], ["Reference", reference]];
  const from = { email: INBOX, name: "PopBia" };
  const notification = {
    from, to: INBOX, replyTo: data.email,
    subject: `PopBia enquiry: ${data.interest} — ${data.business}`,
    text: `New website enquiry\n\n${fields.map(([label, value]) => `${label}: ${value}`).join("\n\n")}\n\nReply to this email to respond directly to the customer.`,
    html: layout("New website enquiry", `<p>Reply to this email to respond directly to the customer.</p><table width="100%" cellspacing="0" cellpadding="0">${fields.map(([label, value]) => `<tr><th scope="row" style="padding:12px 12px 12px 0;border-bottom:1px solid #e7e5e0;text-align:left;vertical-align:top;width:35%;font-size:13px">${label}</th><td style="padding:12px 0;border-bottom:1px solid #e7e5e0;white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table>`)
  };
  const acknowledgement = {
    from, to: data.email, replyTo: INBOX,
    subject: "Thank you for your interest in PopBia",
    text: `Hello ${data.name},\n\nThank you for getting in touch and for your interest in PopBia. We’ve received your enquiry and will get back to you within 1 working day.\n\nWe look forward to learning more about your business and how we can help. If you’d like to add anything in the meantime, simply reply to this email.\n\nKind regards,\nRyan\nPopBia\n\nReference: ${reference}`,
    html: layout("Thank you for getting in touch", `<p>Hello ${escapeHtml(data.name)},</p><p>Thank you for getting in touch and for your interest in PopBia. We’ve received your enquiry and will get back to you <strong>within 1 working day.</strong></p><p>We look forward to learning more about your business and how we can help. If you’d like to add anything in the meantime, simply reply to this email.</p><p>Kind regards,<br><strong>Ryan</strong><br>PopBia</p><p style="font-size:12px;color:#596574">Reference: ${reference}</p>`)
  };
  return { notification, acknowledgement };
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new RangeError("too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/contact") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return failure("Please submit the contact form.", 405);
    if (request.headers.get("Origin") !== url.origin) return failure("Please submit the form from this website.", 403);
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return failure("Unsupported form format.", 415);
    let data;
    try {
      const input = await readBody(request);
      if (input?.website) return failure("Unable to submit this form.", 400);
      data = validate(input);
    } catch (error) {
      return failure(error instanceof RangeError ? "Your message is too long." : "Please check your answers and complete all required fields.", error instanceof RangeError ? 413 : 400);
    }
    if (!env.EMAIL || !env.CONTACT_LIMITER) return failure("The form is temporarily unavailable. Please contact ryan@popbia.com.", 503);
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      for (const key of [`ip:${ip}`, `email:${data.email.toLowerCase()}`]) {
        const { success } = await env.CONTACT_LIMITER.limit({ key });
        if (!success) return failure("Please wait a minute before submitting another query.", 429);
      }
      const reference = crypto.randomUUID();
      const { notification, acknowledgement } = buildEmails(data, reference);
      await env.EMAIL.send(notification);
      // The enquiry is submitted once the business notification is accepted.
      // A failed acknowledgement must not prompt a duplicate enquiry submission.
      try {
        await env.EMAIL.send(acknowledgement);
      } catch {
        console.error(JSON.stringify({ event: "contact_acknowledgement_failed", reference }));
      }
      return json({ ok: true, message: "Query submitted" });
    } catch {
      console.error(JSON.stringify({ event: "contact_submission_failed" }));
      return failure("We couldn’t submit your query. Please try again shortly or contact ryan@popbia.com.", 502);
    }
  }
};
