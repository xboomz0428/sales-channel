import { HttpError } from "@/lib/auth";

type Schema = Record<string, { type: "string" | "string[]" | "number" | "boolean"; required?: boolean }>;

export async function parseBody(
  req: Request,
  schema: Schema
): Promise<any> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "JSON 格式錯誤");
  }
  for (const [key, rule] of Object.entries(schema)) {
    const val = body[key];
    if (rule.required && (val === undefined || val === null || val === "")) {
      throw new HttpError(400, `缺少必填欄位: ${key}`);
    }
    if (val !== undefined && val !== null) {
      if (rule.type === "string" && typeof val !== "string") {
        throw new HttpError(400, `${key} 須為字串`);
      }
      if (rule.type === "number" && typeof val !== "number") {
        throw new HttpError(400, `${key} 須為數字`);
      }
      if (rule.type === "boolean" && typeof val !== "boolean") {
        throw new HttpError(400, `${key} 須為布林值`);
      }
      if (rule.type === "string[]" && !Array.isArray(val)) {
        throw new HttpError(400, `${key} 須為陣列`);
      }
    }
  }
  return body;
}

// ── Schemas ───────────────────────────────────────────

export const enrollSchema: Schema = {
  brandIds: { type: "string[]", required: true },
  sequenceId: { type: "string", required: true },
};

export const generateSchema: Schema = {
  brandId: { type: "string", required: true },
  channel: { type: "string", required: true },
  productFocus: { type: "string" },
  sequenceStepId: { type: "string" },
  templateId: { type: "string" },
};

export const sendSchema: Schema = {
  messageId: { type: "string", required: true },
  override: { type: "boolean" },
};

export const replySchema: Schema = {
  brandId: { type: "string", required: true },
  channel: { type: "string", required: true },
  body: { type: "string", required: true },
};

export const templateCreateSchema: Schema = {
  name: { type: "string", required: true },
  channel: { type: "string", required: true },
  body: { type: "string", required: true },
  industry: { type: "string" },
  productFocus: { type: "string" },
  subject: { type: "string" },
  bodyHtml: { type: "string" },
  blocksJson: { type: "string" },
};

export const templateUpdateSchema: Schema = {
  name: { type: "string" },
  channel: { type: "string" },
  body: { type: "string" },
  industry: { type: "string" },
  productFocus: { type: "string" },
  subject: { type: "string" },
  bodyHtml: { type: "string" },
  blocksJson: { type: "string" },
  isActive: { type: "boolean" },
};

export const newsletterSendSchema: Schema = {
  templateId: { type: "string", required: true },
  brandIds: { type: "string[]" },
  manualEmails: { type: "string[]" },
};
